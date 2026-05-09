/**
 * Zod schemas for every domain event payload.
 *
 * Validated inside publish() before the event is accepted into the bus.
 * A schema violation short-circuits to EventDeadLettered immediately,
 * which is how Confluent Schema Registry enforcement works in production
 * (schema mismatch → rejected before reaching consumer groups).
 */

import { z } from "zod";
import type { EventType } from "./types";

// ─── Shared primitives ────────────────────────────────────────────────────────

const uuid    = z.string().uuid();
const isoDate = z.string().datetime({ offset: true });
const amount  = z.number().positive();

// ─── Per-event payload schemas ────────────────────────────────────────────────

const OrderCreated = z.object({
  orderId:        uuid,
  customerId:     z.string().min(1),
  customerName:   z.string().min(1),
  customerEmail:  z.string().email(),
  totalAmount:    amount,
  itemCount:      z.number().int().positive(),
  idempotencyKey: z.string().min(1),
});

const OrderValidated = z.object({
  orderId:     uuid,
  validatedAt: isoDate,
});

const OrderValidationFailed = z.object({
  reason: z.string().min(1),
});

const InventoryReserved = z.object({
  reservationId: z.string().min(1),
  items:         z.array(z.object({ sku: z.string(), qty: z.number().int().positive() })),
});

const InventoryReservationFailed = z.object({
  reason:    z.string().min(1),
  sku:       z.string(),
  requested: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
});

const PaymentProcessed = z.object({
  transactionId: z.string().min(1),
  amount:        amount,
  currency:      z.string().length(3),
  method:        z.string().min(1),
});

const PaymentFailed = z.object({
  reason:   z.string().min(1),
  amount:   amount,
  currency: z.string().length(3),
});

const OrderConfirmed = z.object({
  orderId:          uuid,
  confirmedAt:      isoDate,
  processingTimeMs: z.number().int().nonnegative(),
});

const CompensationStarted = z.object({
  reason:  z.string().min(1),
  trigger: z.string().min(1),
});

const OrderCompensated = z.object({
  compensatedAt: isoDate,
  reason:        z.string().min(1),
});

const NotificationQueued = z.object({
  channel:   z.enum(["email", "sms", "push"]),
  recipient: z.string().min(1),
  template:  z.string().min(1),
});

const NotificationSent = NotificationQueued.extend({
  sentAt:    isoDate,
  messageId: z.string().min(1),
});

const EventRetried = z.object({
  originalType:  z.string().min(1),
  retryCount:    z.number().int().positive(),
  nextAttemptMs: z.number().int().nonnegative(),
});

const EventDeadLettered = z.object({
  originalType: z.string().min(1),
  reason:       z.string().min(1),
  dlqId:        z.string().min(1),
});

// ─── Registry ─────────────────────────────────────────────────────────────────

export const EVENT_SCHEMAS: Partial<Record<EventType, z.ZodTypeAny>> = {
  OrderCreated,
  OrderValidated,
  OrderValidationFailed,
  InventoryReserved,
  InventoryReservationFailed,
  PaymentProcessed,
  PaymentFailed,
  OrderConfirmed,
  CompensationStarted,
  OrderCompensated,
  NotificationQueued,
  NotificationSent,
  EventRetried,
  EventDeadLettered,
};

export type SchemaValidationError = {
  eventType: EventType;
  issues: z.ZodIssue[];
};

export function validateEventPayload(
  type: EventType,
  payload: Record<string, unknown>
): SchemaValidationError | null {
  const schema = EVENT_SCHEMAS[type];
  if (!schema) return null; // no schema = no validation (allow through)

  const result = schema.safeParse(payload);
  if (result.success) return null;

  return { eventType: type, issues: result.error.issues };
}
