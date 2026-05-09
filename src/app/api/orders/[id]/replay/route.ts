/**
 * Event replay — rebuilds the ProjectionOrderView from the stored event log.
 *
 * This is the core event sourcing promise: the read model is fully derived
 * from events. Deleting and rebuilding it from scratch produces identical state.
 *
 * The projection is rebuilt in-process without re-running any handlers,
 * so there are no side effects (no new events emitted, no inventory touched).
 */

import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import type { OrderStatus, EventType } from "@/lib/types";

// Pure state machine: event type → resulting OrderStatus
const EVENT_TRANSITIONS: Partial<Record<EventType, OrderStatus>> = {
  OrderCreated:               "CREATED",
  OrderValidated:             "VALIDATED",
  OrderValidationFailed:      "VALIDATION_FAILED",
  InventoryReserved:          "INVENTORY_RESERVED",
  InventoryReservationFailed: "INVENTORY_FAILED",
  PaymentProcessed:           "PAYMENT_PROCESSED",
  PaymentFailed:              "PAYMENT_FAILED",
  OrderConfirmed:             "CONFIRMED",
  CompensationStarted:        "COMPENSATION_STARTED",
  OrderCompensated:           "COMPENSATED",
  EventDeadLettered:          "DEAD_LETTERED",
};

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const order = store.getOrder(params.id);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const events = store.getEventsForOrder(params.id);
  if (events.length === 0) {
    return NextResponse.json({ error: "No events to replay" }, { status: 400 });
  }

  // ── Walk events in creation order, apply transitions ─────────────────────────
  let status: OrderStatus = "CREATED";
  let lastEventType: EventType | null = null;
  let lastEventTime: Date | null = null;
  let retryCount = 0;
  const isInDLQ = events.some((e) => e.status === "DEAD_LETTERED");
  let processingTimeMs: number | null = null;

  for (const ev of events) {
    const next = EVENT_TRANSITIONS[ev.type];
    if (next) status = next;
    lastEventType = ev.type;
    lastEventTime = ev.timestamp;
    retryCount   += ev.retryCount;

    // Calculate processing time: from OrderCreated to OrderConfirmed/Compensated
    if ((ev.type === "OrderConfirmed" || ev.type === "OrderCompensated") && ev.processedAt) {
      processingTimeMs = ev.processedAt.getTime() - order.createdAt.getTime();
    }
  }

  // ── Overwrite the projection ──────────────────────────────────────────────────
  store.saveProjection({
    orderId:         params.id,
    status,
    customerName:    order.customerName,
    customerEmail:   order.customerEmail,
    totalAmount:     order.totalAmount,
    eventCount:      events.length,
    retryCount,
    lastEventType,
    lastEventTime,
    processingTimeMs,
    isInDLQ,
    createdAt:       order.createdAt,
    updatedAt:       new Date(),
  });

  // Also sync the write model status
  store.saveOrder({ ...order, status, updatedAt: new Date() });

  return NextResponse.json({
    ok: true,
    eventsReplayed: events.length,
    rebuiltStatus: status,
    message: `Projection rebuilt from ${events.length} events → status: ${status}`,
  });
}
