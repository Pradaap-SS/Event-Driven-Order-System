import { NextResponse } from "next/server";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "OrderFlow — Event-Driven Order System",
    version: "1.0.0",
    description: "REST API for an event-driven order processing platform demonstrating CQRS, saga compensation, DLQ, idempotency, and distributed tracing patterns.",
    contact: { name: "OrderFlow Demo" },
  },
  servers: [{ url: "/api", description: "Current server" }],
  tags: [
    { name: "Orders",   description: "Order commands and queries (CQRS)" },
    { name: "Events",   description: "Event log and processing" },
    { name: "Metrics",  description: "Operational dashboard metrics" },
    { name: "Chaos",    description: "Fault injection and chaos engineering" },
    { name: "DLQ",      description: "Dead-letter queue management" },
    { name: "Demo",     description: "Demo and load-test utilities" },
  ],
  paths: {
    "/orders": {
      get: {
        tags: ["Orders"],
        summary: "List all orders",
        description: "Returns orders sorted by creation time (newest first). Supports filtering by status and full-text search.",
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["ALL","CREATED","VALIDATED","INVENTORY_RESERVED","PAYMENT_PROCESSED","CONFIRMED","PAYMENT_FAILED","INVENTORY_FAILED","COMPENSATION_STARTED","COMPENSATED","DEAD_LETTERED"] } },
          { name: "search", in: "query", schema: { type: "string" }, description: "Search across customer name, email, and order ID" },
        ],
        responses: { "200": { description: "List of orders with total count" } },
      },
      post: {
        tags: ["Orders"],
        summary: "Create a new order (command)",
        description: "Accepts a CreateOrder command. Returns immediately with ACCEPTED or DUPLICATE status. Processing continues asynchronously via the event pipeline.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["customerName", "customerEmail", "customerId", "items"],
                properties: {
                  customerName:   { type: "string", example: "Aisha Patel" },
                  customerEmail:  { type: "string", format: "email" },
                  customerId:     { type: "string" },
                  items:          { type: "array", items: { type: "object", properties: { sku: { type: "string" }, name: { type: "string" }, quantity: { type: "integer", minimum: 1 }, unitPrice: { type: "number" } } } },
                  idempotencyKey: { type: "string", description: "Client-provided key for duplicate detection (24h TTL)" },
                  notes:          { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Order accepted — processing asynchronously" },
          "200": { description: "Duplicate detected — idempotency key matched, returning existing order" },
          "400": { description: "Invalid request" },
        },
      },
    },
    "/orders/{id}": {
      get: {
        tags: ["Orders"],
        summary: "Get order with full event chain",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Order + events + projection + DLQ events + execution logs" }, "404": { description: "Not found" } },
      },
    },
    "/orders/{id}/replay": {
      post: {
        tags: ["Orders"],
        summary: "Rebuild projection from event log",
        description: "Event sourcing replay — walks the stored event log and rebuilds the ProjectionOrderView from scratch without re-running handlers. No side effects.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Projection rebuilt — returns event count and resulting status" } },
      },
    },
    "/orders/{id}/export": {
      get: {
        tags: ["Orders"],
        summary: "Export event log as NDJSON",
        description: "Returns the complete event chain as Newline-Delimited JSON. One JSON object per line. Suitable for piping to jq or loading into BigQuery.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "NDJSON file download", content: { "application/x-ndjson": {} } } },
      },
    },
    "/orders/{id}/traces": {
      get: {
        tags: ["Orders"],
        summary: "Get distributed trace waterfall",
        description: "Returns OTel-compatible spans for the order's processing lifecycle. traceId = correlationId, parentSpanId = causationId.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Waterfall spans with timing and status" } },
      },
    },
    "/events": {
      get: {
        tags: ["Events"],
        summary: "Get all events (audit log)",
        description: "Paginated, filterable view of every domain event across all orders. The immutable append-only source of truth.",
        parameters: [
          { name: "page",   in: "query", schema: { type: "integer", default: 1 } },
          { name: "type",   in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "search", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Paginated event list with total count" } },
      },
    },
    "/events/process": {
      post: {
        tags: ["Events"],
        summary: "Trigger a processing batch",
        description: "Simulates a Kafka consumer group poll. Picks up to 8 PENDING events where scheduledFor <= now, runs handlers, records spans.",
        responses: { "200": { description: "{ processed, failed, deadLettered }" } },
      },
    },
    "/metrics": {
      get: {
        tags: ["Metrics"],
        summary: "Dashboard metrics snapshot",
        description: "KPIs, throughput chart, latency percentiles (p50/p95/p99), consumer health, consumer lag, and recent event traces. Also triggers event processing.",
        responses: { "200": { description: "Full DashboardMetrics object" } },
      },
    },
    "/stream": {
      get: {
        tags: ["Metrics"],
        summary: "Server-Sent Events metrics stream",
        description: "Persistent SSE connection. Server pushes metric snapshots at adaptive intervals (600ms active, 6s idle). EventSource auto-reconnects on drop.",
        responses: { "200": { description: "text/event-stream — each frame is a DashboardMetrics JSON object" } },
      },
    },
    "/chaos": {
      get: {
        tags: ["Chaos"],
        summary: "Get current chaos configuration",
        responses: { "200": { description: "ChaosConfig object" } },
      },
      put: {
        tags: ["Chaos"],
        summary: "Update chaos configuration",
        description: "Fault rates are applied at handler execution time (not event creation), so changes take effect on the next processing cycle.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  paymentFailureRate:   { type: "number", minimum: 0, maximum: 1 },
                  inventoryFailureRate: { type: "number", minimum: 0, maximum: 1 },
                  processingDelayMs:   { type: "integer", minimum: 0, maximum: 5000 },
                  consumerTimeoutRate: { type: "number", minimum: 0, maximum: 1 },
                  poisonMessageEnabled:{ type: "boolean" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated ChaosConfig" } },
      },
    },
    "/circuit-breakers": {
      get: {
        tags: ["Chaos"],
        summary: "Get circuit breaker states",
        description: "Returns CLOSED/OPEN/HALF_OPEN state, failure count, and next retry time for each protected consumer.",
        responses: { "200": { description: "Array of CBStats" } },
      },
      post: {
        tags: ["Chaos"],
        summary: "Reset circuit breaker(s)",
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { name: { type: "string", description: "Omit to reset all" } } },
            },
          },
        },
        responses: { "200": { description: "{ ok, name? }" } },
      },
    },
    "/dlq": {
      get: {
        tags: ["DLQ"],
        summary: "List dead-letter queue events",
        responses: { "200": { description: "Array of DeadLetterEvent" } },
      },
    },
    "/dlq/{id}/retry": {
      post: {
        tags: ["DLQ"],
        summary: "Requeue a single DLQ event",
        description: "Resets retry count to 0 and re-adds the original event to the PENDING queue.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Event re-queued" }, "404": { description: "Not found or already resolved" } },
      },
    },
    "/dlq/retry-all": {
      post: {
        tags: ["DLQ"],
        summary: "Requeue all pending DLQ events",
        responses: { "200": { description: "{ ok, retried, total }" } },
      },
    },
    "/demo": {
      post: {
        tags: ["Demo"],
        summary: "Run canonical demo scenario",
        description: "Clears the store, then generates N orders cycling through 5 canonical types: happy path, payment failure, inventory failure, idempotency, and delayed.",
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { count: { type: "integer", minimum: 1, maximum: 100, default: 5 } } },
            },
          },
        },
        responses: { "200": { description: "{ ok, orderIds, message }" } },
      },
      delete: {
        tags: ["Demo"],
        summary: "Clear all data",
        responses: { "200": { description: "Store cleared" } },
      },
    },
    "/load-test": {
      post: {
        tags: ["Demo"],
        summary: "Flood the system with N orders",
        description: "Creates orders as fast as possible (no draining). Used to demonstrate write-path throughput and queue build-up. Watch the SSE stream spike.",
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { count: { type: "integer", minimum: 1, maximum: 500, default: 50 } } },
            },
          },
        },
        responses: { "200": { description: "{ ok, count, createdMs, ordersPerSec, sample }" } },
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(spec, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
