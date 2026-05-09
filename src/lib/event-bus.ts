/**
 * Event Bus — the core of the async simulation.
 *
 * Augmented with three production patterns:
 *   1. Zod schema validation on publish() — schema violations → immediate DLQ
 *   2. OpenTelemetry-compatible spans — each handler call creates a traceable span
 *   3. Consumer group lag tracking — measures queue wait time per event type
 */

import { v4 as uuid } from "uuid";
import { store } from "./store";
import { validateEventPayload } from "./schemas";
import { startSpan, endSpan, addSpanEvent } from "./tracer";
import type { DomainEvent, EventType, DeadLetterEvent } from "./types";

type EventHandler = (event: DomainEvent) => Promise<void>;

interface HandlerRegistration {
  consumer: string;
  handler: EventHandler;
}

const MAX_RETRIES       = 3;
const BASE_RETRY_DELAY  = 800; // ms

// ─── Handler Registry ─────────────────────────────────────────────────────────

const registry = new Map<EventType, HandlerRegistration[]>();

export function subscribe(
  type: EventType,
  consumer: string,
  handler: EventHandler
): void {
  const existing = registry.get(type) ?? [];
  existing.push({ consumer, handler });
  registry.set(type, existing);
}

// ─── Event Publishing (with Zod validation) ───────────────────────────────────

export function publish(
  event: Omit<DomainEvent, "id" | "status" | "retryCount" | "processingError" | "processedAt" | "processingLatencyMs">
): DomainEvent {
  // ── Schema validation ──────────────────────────────────────────────────────
  const validationError = validateEventPayload(event.type, event.payload);

  if (validationError) {
    // Schema violation → emit as dead-lettered immediately (no retry)
    // This mirrors Confluent Schema Registry behaviour: bad producer is rejected
    // at the bus boundary, not retried 3× at consumer expense.
    const rejectedId = uuid();
    const rejected: DomainEvent = {
      ...event,
      id: rejectedId,
      status: "DEAD_LETTERED",
      retryCount: 0,
      processingError: `Schema violation: ${validationError.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      processedAt: null,
      processingLatencyMs: null,
    };
    store.saveEvent(rejected);

    const dlq: DeadLetterEvent = {
      id: uuid(),
      originalEventId: rejectedId,
      eventType: event.type,
      aggregateId: event.aggregateId,
      correlationId: event.correlationId,
      payload: event.payload,
      failureReason: rejected.processingError!,
      retryCount: 0,
      deadLetteredAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
    };
    store.saveDLQ(dlq);
    return rejected;
  }

  // ── Accepted event ─────────────────────────────────────────────────────────
  const full: DomainEvent = {
    ...event,
    id: uuid(),
    status: "PENDING",
    retryCount: 0,
    processingError: null,
    processedAt: null,
    processingLatencyMs: null,
  };
  store.saveEvent(full);
  return full;
}

// ─── Batch Processor (with spans + lag tracking) ──────────────────────────────

export async function processNextBatch(limit = 5): Promise<{
  processed: number;
  failed: number;
  deadLettered: number;
}> {
  const pending = store.getPendingEvents().slice(0, limit);
  let processed = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const event of pending) {
    const handlers = registry.get(event.type) ?? [];

    // Consumer lag: time from event creation to now (queue wait time)
    const lagMs = Date.now() - event.timestamp.getTime();
    store.recordLag(event.type, lagMs);

    if (handlers.length === 0) {
      store.updateEvent(event.id, {
        status: "PROCESSED",
        consumer: "no-op",
        processedAt: new Date(),
        processingLatencyMs: 0,
      });
      processed++;
      continue;
    }

    store.updateEvent(event.id, { status: "PROCESSING" });

    const startTime = Date.now();
    let success = true;
    let lastError = "";

    for (const { consumer, handler } of handlers) {
      const logId = uuid();

      // ── Start OTel-compatible span ─────────────────────────────────────────
      const span = startSpan({
        traceId:      event.correlationId,   // trace = one order's full lifecycle
        parentSpanId: event.causationId,     // parent = the event that caused this
        name:         `${consumer}/${event.type}`,
        service:      consumer,
        kind:         "CONSUMER",
        attributes: {
          "event.id":           event.id,
          "event.type":         event.type,
          "event.aggregateId":  event.aggregateId,
          "event.retryCount":   event.retryCount,
          "event.lagMs":        lagMs,
          "consumer.name":      consumer,
        },
      });

      store.appendExecutionLog({
        id: logId,
        eventId: event.id,
        eventType: event.type,
        consumer,
        startedAt: new Date(),
        completedAt: null,
        status: "RETRYING",
        error: null,
        latencyMs: null,
      });

      try {
        await handler(event);
        const handlerMs = Date.now() - startTime;

        endSpan(span, "OK");
        addSpanEvent(span, "handler.success", { latencyMs: handlerMs });

        store.appendExecutionLog({
          id: logId,
          eventId: event.id,
          eventType: event.type,
          consumer,
          startedAt: new Date(),
          completedAt: new Date(),
          status: "SUCCESS",
          error: null,
          latencyMs: handlerMs,
        });
      } catch (err) {
        success = false;
        lastError = err instanceof Error ? err.message : String(err);

        endSpan(span, "ERROR", lastError);
        addSpanEvent(span, "handler.error", { error: lastError });

        store.appendExecutionLog({
          id: logId,
          eventId: event.id,
          eventType: event.type,
          consumer,
          startedAt: new Date(),
          completedAt: new Date(),
          status: "FAILED",
          error: lastError,
          latencyMs: Date.now() - startTime,
        });
      }
    }

    const latencyMs = Date.now() - startTime;

    if (success) {
      store.updateEvent(event.id, {
        status: "PROCESSED",
        consumer: handlers.map((h) => h.consumer).join(","),
        processedAt: new Date(),
        processingLatencyMs: latencyMs,
      });
      store.recordLatency(latencyMs);
      processed++;
    } else {
      const newRetryCount = event.retryCount + 1;

      if (newRetryCount > MAX_RETRIES) {
        const dlq: DeadLetterEvent = {
          id: uuid(),
          originalEventId: event.id,
          eventType: event.type,
          aggregateId: event.aggregateId,
          correlationId: event.correlationId,
          payload: event.payload,
          failureReason: lastError,
          retryCount: newRetryCount,
          deadLetteredAt: new Date(),
          resolvedAt: null,
          resolvedBy: null,
        };
        store.saveDLQ(dlq);
        store.updateEvent(event.id, {
          status: "DEAD_LETTERED",
          retryCount: newRetryCount,
          processingError: lastError,
          processingLatencyMs: latencyMs,
        });

        const order = store.getOrder(event.aggregateId);
        if (order) {
          store.saveOrder({ ...order, status: "DEAD_LETTERED", updatedAt: new Date() });
          const proj = store.getProjection(order.id);
          if (proj) store.saveProjection({ ...proj, status: "DEAD_LETTERED", isInDLQ: true, updatedAt: new Date() });
        }

        publish({
          type: "EventDeadLettered",
          correlationId: event.correlationId,
          causationId: event.id,
          aggregateId: event.aggregateId,
          payload: { originalType: event.type, reason: lastError, dlqId: dlq.id },
          timestamp: new Date(),
          scheduledFor: new Date(),
          producer: "dlq-processor",
          consumer: null,
          maxRetries: 0,
        });

        deadLettered++;
      } else {
        const delayMs = BASE_RETRY_DELAY * Math.pow(2, event.retryCount);
        store.updateEvent(event.id, {
          status: "PENDING",
          retryCount: newRetryCount,
          scheduledFor: new Date(Date.now() + delayMs),
          processingError: lastError,
        });

        publish({
          type: "EventRetried",
          correlationId: event.correlationId,
          causationId: event.id,
          aggregateId: event.aggregateId,
          payload: { originalType: event.type, retryCount: newRetryCount, nextAttemptMs: delayMs },
          timestamp: new Date(),
          scheduledFor: new Date(),
          producer: "retry-scheduler",
          consumer: null,
          maxRetries: 0,
        });

        failed++;
      }
    }
  }

  return { processed, failed, deadLettered };
}

// ─── Retry a DLQ event ────────────────────────────────────────────────────────

export function requeueDLQEvent(dlqId: string): boolean {
  const dlq = store.getDLQEvent(dlqId);
  if (!dlq || dlq.resolvedAt) return false;

  const originalEvent = store.getEvent(dlq.originalEventId);
  if (!originalEvent) return false;

  store.updateEvent(dlq.originalEventId, {
    status: "PENDING",
    retryCount: 0,
    processingError: null,
    scheduledFor: new Date(),
  });

  store.updateDLQ(dlqId, { resolvedAt: new Date(), resolvedBy: "manual-retry" });

  const order = store.getOrder(dlq.aggregateId);
  if (order && order.status === "DEAD_LETTERED") {
    store.saveOrder({ ...order, status: "CREATED", updatedAt: new Date() });
    const proj = store.getProjection(order.id);
    if (proj) store.saveProjection({ ...proj, status: "CREATED", isInDLQ: false, updatedAt: new Date() });
  }

  return true;
}
