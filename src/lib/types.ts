// ─── Order Domain ─────────────────────────────────────────────────────────────

export type OrderStatus =
  | "CREATED"
  | "VALIDATED"
  | "INVENTORY_RESERVED"
  | "PAYMENT_PROCESSED"
  | "CONFIRMED"
  | "VALIDATION_FAILED"
  | "INVENTORY_FAILED"
  | "PAYMENT_FAILED"
  | "COMPENSATION_STARTED"
  | "COMPENSATED"
  | "DEAD_LETTERED";

export interface OrderItem {
  id: string;
  orderId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  items: OrderItem[];
  totalAmount: number;
  idempotencyKey: string;
  correlationId: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

// ─── Event System ─────────────────────────────────────────────────────────────

export type EventType =
  | "OrderCreated"
  | "OrderValidated"
  | "OrderValidationFailed"
  | "InventoryReserved"
  | "InventoryReservationFailed"
  | "PaymentProcessed"
  | "PaymentFailed"
  | "OrderConfirmed"
  | "CompensationStarted"
  | "OrderCompensated"
  | "NotificationQueued"
  | "NotificationSent"
  | "EventRetried"
  | "EventDeadLettered";

export type EventStatus = "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED" | "DEAD_LETTERED";

export interface DomainEvent {
  id: string;
  type: EventType;
  correlationId: string;
  causationId: string | null;
  aggregateId: string; // orderId
  payload: Record<string, unknown>;
  timestamp: Date;
  scheduledFor: Date; // for delay simulation
  producer: string;
  consumer: string | null;
  retryCount: number;
  maxRetries: number;
  status: EventStatus;
  processingError: string | null;
  processedAt: Date | null;
  processingLatencyMs: number | null;
}

// ─── Projection / Read Model ──────────────────────────────────────────────────

export interface ProjectionOrderView {
  orderId: string;
  status: OrderStatus;
  customerName: string;
  customerEmail: string;
  totalAmount: number;
  eventCount: number;
  retryCount: number;
  lastEventType: EventType | null;
  lastEventTime: Date | null;
  processingTimeMs: number | null;
  isInDLQ: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Dead Letter Queue ────────────────────────────────────────────────────────

export interface DeadLetterEvent {
  id: string;
  originalEventId: string;
  eventType: EventType;
  aggregateId: string;
  correlationId: string;
  payload: Record<string, unknown>;
  failureReason: string;
  retryCount: number;
  deadLetteredAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}

// ─── Idempotency ──────────────────────────────────────────────────────────────

export interface IdempotencyRecord {
  key: string;
  result: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
}

// ─── Consumer Execution Log ───────────────────────────────────────────────────

export interface ConsumerExecutionLog {
  id: string;
  eventId: string;
  eventType: EventType;
  consumer: string;
  startedAt: Date;
  completedAt: Date | null;
  status: "SUCCESS" | "FAILED" | "RETRYING";
  error: string | null;
  latencyMs: number | null;
}

// ─── Chaos / Fault Injection ──────────────────────────────────────────────────

export interface ChaosConfig {
  paymentFailureRate: number;     // 0–1
  inventoryFailureRate: number;   // 0–1
  processingDelayMs: number;      // 0–5000ms added to scheduledFor
  duplicateEventRate: number;     // 0–1
  consumerTimeoutRate: number;    // 0–1
  poisonMessageEnabled: boolean;
}

// ─── API Response Shapes ──────────────────────────────────────────────────────

export interface CreateOrderInput {
  customerName: string;
  customerEmail: string;
  customerId: string;
  items: Array<{ sku: string; name: string; quantity: number; unitPrice: number }>;
  notes?: string;
  idempotencyKey?: string;
}

export interface EventThroughputPoint {
  minute: string;
  count: number;
}

export interface DashboardMetrics {
  totalOrders: number;
  successRate: number;
  avgProcessingMs: number;
  failedEvents: number;
  pendingEvents: number;
  dlqCount: number;
  totalRetries: number;
  throughputPerMinute: number;
  ordersByStatus: Record<OrderStatus, number>;
  recentEvents: DomainEvent[];
  eventThroughput: EventThroughputPoint[];
  latencyByType: Array<{ type: string; avgMs: number }>;
}
