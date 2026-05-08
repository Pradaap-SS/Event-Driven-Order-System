/**
 * Event Bus — the core of the async simulation.
 *
 * Consumers register typed handlers. The /api/events/process endpoint calls
 * processNextBatch() on each poll tick, advancing the event pipeline.
 *
 * Retry strategy: exponential backoff, max 3 attempts, then DLQ.
 * Idempotency: each event is processed at most once per consumer via event ID.
 */

import { v4 as uuid } from "uuid";
import { store } from "./store";
import type { DomainEvent, EventType, DeadLetterEvent } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

type EventHandler = (event: DomainEvent) => Promise<void>;

interface HandlerRegistration {
  consumer: string;
  handler: EventHandler;
}

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 800;

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

// ─── Event Publishing ─────────────────────────────────────────────────────────

export function publish(
  event: Omit<DomainEvent, "id" | "status" | "retryCount" | "processingError" | "processedAt" | "processingLatencyMs">
): DomainEvent {
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

// ─── Batch Processor ──────────────────────────────────────────────────────────

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

    // No handler registered — skip silently (not a consumer concern)
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

    // Mark as processing
    store.updateEvent(event.id, { status: "PROCESSING" });

    const startTime = Date.now();
    let success = true;
    let lastError = "";

    for (const { consumer, handler } of handlers) {
      const logId = uuid();
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
        store.appendExecutionLog({
          id: logId,
          eventId: event.id,
          eventType: event.type,
          consumer,
          startedAt: new Date(),
          completedAt: new Date(),
          status: "SUCCESS",
          error: null,
          latencyMs: Date.now() - startTime,
        });
      } catch (err) {
        success = false;
        lastError = err instanceof Error ? err.message : String(err);
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
      processed++;
    } else {
      const newRetryCount = event.retryCount + 1;

      if (newRetryCount > MAX_RETRIES) {
        // Move to DLQ
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

        // Update order projection
        const order = store.getOrder(event.aggregateId);
        if (order) {
          store.saveOrder({ ...order, status: "DEAD_LETTERED", updatedAt: new Date() });
          const proj = store.getProjection(order.id);
          if (proj) {
            store.saveProjection({
              ...proj,
              status: "DEAD_LETTERED",
              isInDLQ: true,
              updatedAt: new Date(),
            });
          }
        }

        // Emit DeadLettered event
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
        // Schedule retry with exponential backoff
        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, event.retryCount);
        const scheduledFor = new Date(Date.now() + delayMs);

        store.updateEvent(event.id, {
          status: "PENDING",
          retryCount: newRetryCount,
          scheduledFor,
          processingError: lastError,
        });

        // Emit EventRetried signal
        publish({
          type: "EventRetried",
          correlationId: event.correlationId,
          causationId: event.id,
          aggregateId: event.aggregateId,
          payload: {
            originalType: event.type,
            retryCount: newRetryCount,
            nextAttemptMs: delayMs,
          },
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

  // Reset and reschedule
  store.updateEvent(dlq.originalEventId, {
    status: "PENDING",
    retryCount: 0,
    processingError: null,
    scheduledFor: new Date(),
  });

  store.updateDLQ(dlqId, {
    resolvedAt: new Date(),
    resolvedBy: "manual-retry",
  });

  // Update order status
  const order = store.getOrder(dlq.aggregateId);
  if (order && order.status === "DEAD_LETTERED") {
    store.saveOrder({ ...order, status: "CREATED", updatedAt: new Date() });
    const proj = store.getProjection(order.id);
    if (proj) {
      store.saveProjection({
        ...proj,
        status: "CREATED",
        isInDLQ: false,
        updatedAt: new Date(),
      });
    }
  }

  return true;
}
