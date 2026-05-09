/**
 * Domain event handlers — each represents a logical "consumer service."
 *
 * In a real system these would be separate Kubernetes pods/deployments.
 * Here they're typed functions registered with the event bus.
 *
 * Chaos config is checked at call time so the Failure Lab slider changes
 * take effect immediately without restarting anything.
 */

import { subscribe, publish } from "@/lib/event-bus";
import { store } from "@/lib/store";
import { getBreaker } from "@/lib/circuit-breaker";
import type { DomainEvent, OrderStatus } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scheduleAfter(ms: number): Date {
  return new Date(Date.now() + ms);
}

function maybeDelay(): number {
  const chaos = store.getChaos();
  return chaos.processingDelayMs;
}

function updateOrderStatus(orderId: string, status: OrderStatus): void {
  const order = store.getOrder(orderId);
  if (!order) return;
  store.saveOrder({ ...order, status, updatedAt: new Date() });

  const proj = store.getProjection(orderId);
  if (proj) {
    store.saveProjection({ ...proj, status, updatedAt: new Date() });
  }
}

function updateProjectionLastEvent(event: DomainEvent): void {
  const proj = store.getProjection(event.aggregateId);
  if (!proj) return;
  const eventsForOrder = store.getEventsForOrder(event.aggregateId);
  const totalRetries = eventsForOrder.reduce((s, e) => s + e.retryCount, 0);
  store.saveProjection({
    ...proj,
    lastEventType: event.type,
    lastEventTime: event.timestamp,
    retryCount: totalRetries,
    eventCount: eventsForOrder.length,
    updatedAt: new Date(),
  });
}

// ─── Validation Service ───────────────────────────────────────────────────────

subscribe("OrderCreated", "validation-service", async (event: DomainEvent) => {
  const delay = maybeDelay();
  const order = store.getOrder(event.aggregateId);
  if (!order) throw new Error("Order not found");

  const chaos = store.getChaos();
  if (chaos.poisonMessageEnabled) {
    throw new Error("Poison message: malformed order payload");
  }

  // Basic validation: items must exist and amounts must be positive
  const valid = order.items.length > 0 && order.totalAmount > 0;

  updateProjectionLastEvent(event);

  if (valid) {
    updateOrderStatus(order.id, "VALIDATED");
    publish({
      type: "OrderValidated",
      correlationId: event.correlationId,
      causationId: event.id,
      aggregateId: order.id,
      payload: { orderId: order.id, validatedAt: new Date().toISOString() },
      timestamp: new Date(),
      scheduledFor: scheduleAfter(600 + delay),
      producer: "validation-service",
      consumer: null,
      maxRetries: 3,
    });
  } else {
    updateOrderStatus(order.id, "VALIDATION_FAILED");
    publish({
      type: "OrderValidationFailed",
      correlationId: event.correlationId,
      causationId: event.id,
      aggregateId: order.id,
      payload: { reason: "Invalid order: no items or zero amount" },
      timestamp: new Date(),
      scheduledFor: scheduleAfter(delay),
      producer: "validation-service",
      consumer: null,
      maxRetries: 0,
    });
  }
});

// ─── Inventory Service ────────────────────────────────────────────────────────

subscribe("OrderValidated", "inventory-service", async (event: DomainEvent) => {
  const delay = maybeDelay();
  const order = store.getOrder(event.aggregateId);
  if (!order) throw new Error("Order not found");

  // Circuit breaker wraps the downstream inventory API call
  await getBreaker("inventory-service").call(async () => {
    const chaos = store.getChaos();
    const fail = Math.random() < chaos.inventoryFailureRate;

    updateProjectionLastEvent(event);

    if (fail) {
    updateOrderStatus(order.id, "INVENTORY_FAILED");
    publish({
      type: "InventoryReservationFailed",
      correlationId: event.correlationId,
      causationId: event.id,
      aggregateId: order.id,
      payload: {
        reason: "Insufficient stock",
        sku: order.items[0]?.sku ?? "UNKNOWN",
        requested: order.items[0]?.quantity ?? 0,
        available: Math.floor(Math.random() * (order.items[0]?.quantity ?? 1)),
      },
      timestamp: new Date(),
      scheduledFor: scheduleAfter(delay),
      producer: "inventory-service",
      consumer: null,
      maxRetries: 0,
    });
    } else {
      updateOrderStatus(order.id, "INVENTORY_RESERVED");
      publish({
        type: "InventoryReserved",
        correlationId: event.correlationId,
        causationId: event.id,
        aggregateId: order.id,
        payload: {
          reservationId: `RES-${Date.now()}`,
          items: order.items.map((i) => ({ sku: i.sku, qty: i.quantity })),
        },
        timestamp: new Date(),
        scheduledFor: scheduleAfter(700 + delay),
        producer: "inventory-service",
        consumer: null,
        maxRetries: 3,
      });
    }
  }); // end circuit breaker
});

// ─── Payment Service ──────────────────────────────────────────────────────────

subscribe("InventoryReserved", "payment-service", async (event: DomainEvent) => {
  const delay = maybeDelay();
  const order = store.getOrder(event.aggregateId);
  if (!order) throw new Error("Order not found");

  // Circuit breaker: payment gateway is the most fragile external dependency
  await getBreaker("payment-service").call(async () => {
    const chaos = store.getChaos();

    if (chaos.consumerTimeoutRate > 0 && Math.random() < chaos.consumerTimeoutRate) {
      throw new Error("Payment gateway timeout: upstream service unavailable");
    }

    const fail = Math.random() < chaos.paymentFailureRate;
    updateProjectionLastEvent(event);

    if (fail) {
      updateOrderStatus(order.id, "PAYMENT_FAILED");
      publish({
        type: "PaymentFailed",
        correlationId: event.correlationId,
        causationId: event.id,
        aggregateId: order.id,
        payload: { reason: "Card declined", amount: order.totalAmount, currency: "USD" },
        timestamp: new Date(),
        scheduledFor: scheduleAfter(delay),
        producer: "payment-service",
        consumer: null,
        maxRetries: 0,
      });
    } else {
      updateOrderStatus(order.id, "PAYMENT_PROCESSED");
      publish({
        type: "PaymentProcessed",
        correlationId: event.correlationId,
        causationId: event.id,
        aggregateId: order.id,
        payload: {
          transactionId: `TXN-${Date.now()}`,
          amount: order.totalAmount,
          currency: "USD",
          method: "card",
        },
        timestamp: new Date(),
        scheduledFor: scheduleAfter(500 + delay),
        producer: "payment-service",
        consumer: null,
        maxRetries: 3,
      });
    }
  }); // end circuit breaker
});

// ─── Order Confirmation ───────────────────────────────────────────────────────

subscribe("PaymentProcessed", "order-service", async (event: DomainEvent) => {
  const delay = maybeDelay();
  const order = store.getOrder(event.aggregateId);
  if (!order) throw new Error("Order not found");

  const now = new Date();
  const processingTime = now.getTime() - order.createdAt.getTime();

  updateOrderStatus(order.id, "CONFIRMED");

  const proj = store.getProjection(order.id);
  if (proj) {
    store.saveProjection({
      ...proj,
      status: "CONFIRMED",
      lastEventType: "OrderConfirmed",
      lastEventTime: now,
      processingTimeMs: processingTime,
      updatedAt: now,
    });
  }

  store.saveOrder({ ...order, status: "CONFIRMED", completedAt: now, updatedAt: now });

  publish({
    type: "OrderConfirmed",
    correlationId: event.correlationId,
    causationId: event.id,
    aggregateId: order.id,
    payload: {
      orderId: order.id,
      confirmedAt: now.toISOString(),
      processingTimeMs: processingTime,
    },
    timestamp: new Date(),
    scheduledFor: scheduleAfter(300 + delay),
    producer: "order-service",
    consumer: null,
    maxRetries: 3,
  });

  // Also queue a notification
  publish({
    type: "NotificationQueued",
    correlationId: event.correlationId,
    causationId: event.id,
    aggregateId: order.id,
    payload: {
      channel: "email",
      recipient: order.customerEmail,
      template: "order-confirmed",
      orderId: order.id,
    },
    timestamp: new Date(),
    scheduledFor: scheduleAfter(400 + delay),
    producer: "order-service",
    consumer: null,
    maxRetries: 3,
  });
});

// ─── Notification Service ─────────────────────────────────────────────────────

subscribe("NotificationQueued", "notification-service", async (event: DomainEvent) => {
  const delay = maybeDelay();
  updateProjectionLastEvent(event);

  publish({
    type: "NotificationSent",
    correlationId: event.correlationId,
    causationId: event.id,
    aggregateId: event.aggregateId,
    payload: {
      ...event.payload,
      sentAt: new Date().toISOString(),
      messageId: `MSG-${Date.now()}`,
    },
    timestamp: new Date(),
    scheduledFor: scheduleAfter(200 + delay),
    producer: "notification-service",
    consumer: null,
    maxRetries: 3,
  });
});

// ─── Compensation Service ─────────────────────────────────────────────────────

subscribe("InventoryReservationFailed", "compensation-service", async (event) => {
  const delay = maybeDelay();
  updateProjectionLastEvent(event);
  updateOrderStatus(event.aggregateId, "COMPENSATION_STARTED");

  publish({
    type: "CompensationStarted",
    correlationId: event.correlationId,
    causationId: event.id,
    aggregateId: event.aggregateId,
    payload: { reason: "InventoryReservationFailed", trigger: event.id },
    timestamp: new Date(),
    scheduledFor: scheduleAfter(400 + delay),
    producer: "compensation-service",
    consumer: null,
    maxRetries: 3,
  });
});

subscribe("PaymentFailed", "compensation-service", async (event) => {
  const delay = maybeDelay();
  updateProjectionLastEvent(event);
  updateOrderStatus(event.aggregateId, "COMPENSATION_STARTED");

  publish({
    type: "CompensationStarted",
    correlationId: event.correlationId,
    causationId: event.id,
    aggregateId: event.aggregateId,
    payload: { reason: "PaymentFailed", trigger: event.id },
    timestamp: new Date(),
    scheduledFor: scheduleAfter(400 + delay),
    producer: "compensation-service",
    consumer: null,
    maxRetries: 3,
  });
});

subscribe("CompensationStarted", "compensation-service", async (event) => {
  const delay = maybeDelay();
  updateProjectionLastEvent(event);
  updateOrderStatus(event.aggregateId, "COMPENSATED");

  const order = store.getOrder(event.aggregateId);
  if (order) {
    store.saveOrder({ ...order, status: "COMPENSATED", completedAt: new Date(), updatedAt: new Date() });
  }

  publish({
    type: "OrderCompensated",
    correlationId: event.correlationId,
    causationId: event.id,
    aggregateId: event.aggregateId,
    payload: {
      compensatedAt: new Date().toISOString(),
      reason: (event.payload as { reason?: string }).reason ?? "unknown",
    },
    timestamp: new Date(),
    scheduledFor: scheduleAfter(500 + delay),
    producer: "compensation-service",
    consumer: null,
    maxRetries: 3,
  });

  // Queue compensation notification
  publish({
    type: "NotificationQueued",
    correlationId: event.correlationId,
    causationId: event.id,
    aggregateId: event.aggregateId,
    payload: {
      channel: "email",
      recipient: order?.customerEmail ?? "unknown",
      template: "order-cancelled",
      reason: (event.payload as { reason?: string }).reason,
    },
    timestamp: new Date(),
    scheduledFor: scheduleAfter(600 + delay),
    producer: "compensation-service",
    consumer: null,
    maxRetries: 3,
  });
});
