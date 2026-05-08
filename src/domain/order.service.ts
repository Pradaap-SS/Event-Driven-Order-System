/**
 * Order Service — the command side (write model).
 *
 * Accepts CreateOrder commands, enforces idempotency, persists the order,
 * creates the initial read-model projection, and emits the first domain event.
 */

import { v4 as uuid } from "uuid";
import { store } from "@/lib/store";
import { publish } from "@/lib/event-bus";
import type { Order, ProjectionOrderView, CreateOrderInput } from "@/lib/types";

export interface CreateOrderResult {
  orderId: string;
  correlationId: string;
  status: "ACCEPTED" | "DUPLICATE";
  order: Order;
}

export async function createOrder(
  input: CreateOrderInput
): Promise<CreateOrderResult> {
  const idempotencyKey = input.idempotencyKey ?? uuid();

  // ── Idempotency check ──────────────────────────────────────────────────────
  const existing = store.checkIdempotency(idempotencyKey);
  if (existing) {
    const existingOrder = store.getOrder(
      (existing.result as { orderId: string }).orderId
    );
    if (existingOrder) {
      return {
        orderId: existingOrder.id,
        correlationId: existingOrder.correlationId,
        status: "DUPLICATE",
        order: existingOrder,
      };
    }
  }

  // ── Build order ────────────────────────────────────────────────────────────
  const orderId = uuid();
  const correlationId = uuid();
  const now = new Date();

  const items = input.items.map((item) => ({
    id: uuid(),
    orderId,
    sku: item.sku,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));

  const totalAmount = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );

  const order: Order = {
    id: orderId,
    customerId: input.customerId,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    status: "CREATED",
    items,
    totalAmount,
    idempotencyKey,
    correlationId,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  store.saveOrder(order);

  // ── Create projection (read model) ─────────────────────────────────────────
  const projection: ProjectionOrderView = {
    orderId,
    status: "CREATED",
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    totalAmount,
    eventCount: 0,
    retryCount: 0,
    lastEventType: null,
    lastEventTime: null,
    processingTimeMs: null,
    isInDLQ: false,
    createdAt: now,
    updatedAt: now,
  };
  store.saveProjection(projection);

  // ── Save idempotency record ────────────────────────────────────────────────
  store.saveIdempotency({
    key: idempotencyKey,
    result: { orderId },
    createdAt: now,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24h TTL
  });

  // ── Emit OrderCreated ──────────────────────────────────────────────────────
  publish({
    type: "OrderCreated",
    correlationId,
    causationId: null,
    aggregateId: orderId,
    payload: {
      orderId,
      customerId: input.customerId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      totalAmount,
      itemCount: items.length,
      idempotencyKey,
    },
    timestamp: now,
    scheduledFor: now, // process immediately
    producer: "order-service",
    consumer: null,
    maxRetries: 3,
  });

  return { orderId, correlationId, status: "ACCEPTED", order };
}
