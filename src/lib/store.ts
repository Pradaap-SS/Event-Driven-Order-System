/**
 * In-memory event store — the foundation of the demo system.
 *
 * Uses a `global` anchor so the store survives Next.js hot-module-reloads
 * and persists across all API route calls within the same Node.js process.
 * For production, replace with a Postgres-backed store behind the same interface.
 */

import type {
  Order,
  DomainEvent,
  ProjectionOrderView,
  DeadLetterEvent,
  IdempotencyRecord,
  ConsumerExecutionLog,
  ChaosConfig,
  EventThroughputPoint,
} from "./types";

// ─── Global state shape ───────────────────────────────────────────────────────

interface StoreState {
  orders: Map<string, Order>;
  events: Map<string, DomainEvent>;
  eventQueue: string[];
  projections: Map<string, ProjectionOrderView>;
  dlqEvents: Map<string, DeadLetterEvent>;
  executionLogs: Map<string, ConsumerExecutionLog[]>;
  idempotencyKeys: Map<string, IdempotencyRecord>;
  throughputLog: EventThroughputPoint[];
  chaos: ChaosConfig;
}

// ─── Singleton via global ─────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __orderFlowStore: StoreState | undefined;
}

function createState(): StoreState {
  return {
    orders: new Map(),
    events: new Map(),
    eventQueue: [],
    projections: new Map(),
    dlqEvents: new Map(),
    executionLogs: new Map(),
    idempotencyKeys: new Map(),
    throughputLog: [],
    chaos: {
      paymentFailureRate: 0,
      inventoryFailureRate: 0,
      processingDelayMs: 0,
      duplicateEventRate: 0,
      consumerTimeoutRate: 0,
      poisonMessageEnabled: false,
    },
  };
}

// In development, anchor to `global` to survive HMR. In production, module
// scope is sufficient because each serverless invocation is its own process.
const state: StoreState =
  (global.__orderFlowStore ??= createState());

// ─── Store API ────────────────────────────────────────────────────────────────

export const store = {
  // ── Orders ────────────────────────────────────────────────────────────────
  saveOrder(order: Order): void {
    state.orders.set(order.id, order);
  },
  getOrder(id: string): Order | undefined {
    return state.orders.get(id);
  },
  getAllOrders(): Order[] {
    return Array.from(state.orders.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  },

  // ── Events ────────────────────────────────────────────────────────────────
  saveEvent(event: DomainEvent): void {
    state.events.set(event.id, event);
    if (!state.eventQueue.includes(event.id)) {
      state.eventQueue.push(event.id);
    }
    const minute = new Date(event.timestamp).toISOString().slice(0, 16);
    const existing = state.throughputLog.find((p) => p.minute === minute);
    if (existing) {
      existing.count++;
    } else {
      state.throughputLog.push({ minute, count: 1 });
      if (state.throughputLog.length > 60) state.throughputLog.shift();
    }
  },
  getEvent(id: string): DomainEvent | undefined {
    return state.events.get(id);
  },
  updateEvent(id: string, patch: Partial<DomainEvent>): void {
    const ev = state.events.get(id);
    if (ev) state.events.set(id, { ...ev, ...patch });
  },
  getEventsForOrder(orderId: string): DomainEvent[] {
    return Array.from(state.events.values())
      .filter((e) => e.aggregateId === orderId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  },
  getAllEvents(): DomainEvent[] {
    return Array.from(state.events.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
  },
  getPendingEvents(): DomainEvent[] {
    const now = new Date();
    return state.eventQueue
      .map((id) => state.events.get(id))
      .filter(
        (e): e is DomainEvent =>
          !!e && e.status === "PENDING" && e.scheduledFor <= now
      );
  },

  // ── Projections ───────────────────────────────────────────────────────────
  saveProjection(p: ProjectionOrderView): void {
    state.projections.set(p.orderId, p);
  },
  getProjection(orderId: string): ProjectionOrderView | undefined {
    return state.projections.get(orderId);
  },
  getAllProjections(): ProjectionOrderView[] {
    return Array.from(state.projections.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  },

  // ── Dead Letter Queue ─────────────────────────────────────────────────────
  saveDLQ(event: DeadLetterEvent): void {
    state.dlqEvents.set(event.id, event);
  },
  getDLQEvent(id: string): DeadLetterEvent | undefined {
    return state.dlqEvents.get(id);
  },
  getAllDLQ(): DeadLetterEvent[] {
    return Array.from(state.dlqEvents.values()).sort(
      (a, b) => b.deadLetteredAt.getTime() - a.deadLetteredAt.getTime()
    );
  },
  updateDLQ(id: string, patch: Partial<DeadLetterEvent>): void {
    const d = state.dlqEvents.get(id);
    if (d) state.dlqEvents.set(id, { ...d, ...patch });
  },

  // ── Execution Logs ────────────────────────────────────────────────────────
  appendExecutionLog(log: ConsumerExecutionLog): void {
    const logs = state.executionLogs.get(log.eventId) ?? [];
    logs.push(log);
    state.executionLogs.set(log.eventId, logs);
  },
  getExecutionLogs(eventId: string): ConsumerExecutionLog[] {
    return state.executionLogs.get(eventId) ?? [];
  },
  getAllExecutionLogs(): ConsumerExecutionLog[] {
    return Array.from(state.executionLogs.values()).flat();
  },

  // ── Idempotency ───────────────────────────────────────────────────────────
  checkIdempotency(key: string): IdempotencyRecord | undefined {
    const record = state.idempotencyKeys.get(key);
    if (!record) return undefined;
    if (record.expiresAt < new Date()) {
      state.idempotencyKeys.delete(key);
      return undefined;
    }
    return record;
  },
  saveIdempotency(record: IdempotencyRecord): void {
    state.idempotencyKeys.set(record.key, record);
  },

  // ── Chaos Config ──────────────────────────────────────────────────────────
  getChaos(): ChaosConfig {
    return { ...state.chaos };
  },
  setChaos(config: Partial<ChaosConfig>): void {
    state.chaos = { ...state.chaos, ...config };
  },

  // ── Metrics ───────────────────────────────────────────────────────────────
  getThroughput(): EventThroughputPoint[] {
    return [...state.throughputLog];
  },
  getStats() {
    const allOrders = Array.from(state.orders.values());
    const allEvents = Array.from(state.events.values());
    const processedWithLatency = allEvents.filter(
      (e) => e.status === "PROCESSED" && e.processingLatencyMs !== null
    );
    const avgLatency =
      processedWithLatency.length > 0
        ? processedWithLatency.reduce((s, e) => s + (e.processingLatencyMs ?? 0), 0) /
          processedWithLatency.length
        : 0;

    const confirmed = allOrders.filter((o) => o.status === "CONFIRMED").length;
    const successRate =
      allOrders.length > 0 ? (confirmed / allOrders.length) * 100 : 0;

    return {
      totalOrders: allOrders.length,
      successRate,
      avgProcessingMs: Math.round(avgLatency),
      failedEvents: allEvents.filter(
        (e) => e.status === "FAILED" || e.status === "DEAD_LETTERED"
      ).length,
      pendingEvents: allEvents.filter((e) => e.status === "PENDING").length,
      dlqCount: state.dlqEvents.size,
      totalRetries: allEvents.reduce((s, e) => s + e.retryCount, 0),
    };
  },

  // ── Reset ─────────────────────────────────────────────────────────────────
  reset(): void {
    state.orders.clear();
    state.events.clear();
    state.eventQueue.length = 0;
    state.projections.clear();
    state.dlqEvents.clear();
    state.executionLogs.clear();
    state.idempotencyKeys.clear();
    state.throughputLog.length = 0;
    state.chaos = {
      paymentFailureRate: 0,
      inventoryFailureRate: 0,
      processingDelayMs: 0,
      duplicateEventRate: 0,
      consumerTimeoutRate: 0,
      poisonMessageEnabled: false,
    };
  },
};
