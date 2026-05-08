# OrderFlow — Event-Driven Order System

> A production-grade order processing platform built on event-driven architecture, demonstrating Kafka-style async workflows, CQRS, saga compensation, DLQ, and idempotency patterns — all deployable to Vercel with zero external dependencies.

**Built for:** SDE 2 portfolio review, distributed systems interviews, and recruiter evaluation.

---

## Why This Project Exists

Most portfolio projects are CRUD apps with a database. This is different.

OrderFlow demonstrates how a modern backend engineer thinks about **asynchronous distributed systems**: what happens when a payment fails after inventory is reserved? How do you prevent double-charging under network retries? How do you trace a request across five logical services? How do you recover a stuck message from a dead-letter queue?

These are the problems that matter at companies operating at scale — and this project shows you know how to solve them, even within the constraints of a serverless platform.

---

## Architecture Overview

```
┌─────────────┐     POST /api/orders      ┌──────────────────────┐
│   Browser   │ ─────────────────────────▶ │   API Layer          │
│  Dashboard  │                            │   (Next.js routes)   │
│  (polling)  │ ◀───────────────────────── │   Order Service      │
└─────────────┘     GET /api/metrics       └──────────┬───────────┘
                                                      │ publish(OrderCreated)
                                                      ▼
                                           ┌──────────────────────┐
                                           │   In-Memory Event Bus │
                                           │   (Kafka analogue)   │
                                           └──────────┬───────────┘
                                  ┌──────────────────┼──────────────────┐
                                  ▼                  ▼                  ▼
                       ┌──────────────────┐  ┌──────────┐  ┌─────────────────┐
                       │ Validation Svc   │  │ Inventory│  │ Payment Service │
                       │ Inventory Svc    │  │ Worker   │  │ (retries, DLQ)  │
                       │ Payment Svc      │  └──────────┘  └─────────────────┘
                       │ Notification Svc │
                       │ Compensation Svc │  ┌──────────────────────────────┐
                       └──────────────────┘  │ Projection Store (read model)│
                                             │ ProjectionOrderView / CQRS   │
                                             └──────────────────────────────┘
```

**Modular monolith** in code — each "service" is an isolated domain module that would map 1:1 to a Kubernetes Deployment in production, consuming from its own Kafka consumer group.

---

## Key Engineering Challenges Solved

| Challenge | Solution |
|---|---|
| Double-charge under network retry | Idempotency keys with 24h TTL |
| Partial failure (inventory OK, payment fails) | Choreography-based saga with CompensationStarted events |
| Poison messages that block the queue | DLQ after MAX_RETRIES with manual replay |
| Cross-service request tracing | Correlation IDs propagated through every event |
| Read performance independent of writes | CQRS: separate ProjectionOrderView rebuilt from events |
| Simulating Kafka on Vercel serverless | In-memory event bus anchored to `global` for process persistence |
| Chaos engineering for resilience testing | Runtime fault injection: failure rates, delays, poison messages |

---

## Local Setup (< 60 seconds)

```bash
git clone https://github.com/yourusername/event-driven-order-system
cd event-driven-order-system
npm install
npm run dev
# Open http://localhost:3000
# Click "Run Interview Demo" on the dashboard
```

No Docker. No Kafka. No Postgres. No environment variables required.

The system runs entirely in-memory using Node.js module state. State persists across API calls during the same dev server session.

---

## 3-Minute Interview Demo Script

**0:00** — Open the dashboard. Explain: "This is an engineering control plane for an order processing platform. What you're seeing is a real-time view of an event-driven pipeline."

**0:20** — Click **"Run Interview Demo"**. Explain: "This seeds five canonical scenarios simultaneously: a happy path, a payment failure, an inventory failure, an idempotency replay, and a delayed consumer. The dashboard updates live every 1.5 seconds."

**0:45** — Navigate to **Orders**. Show the status badges updating in real-time: CREATED → VALIDATED → INVENTORY_RESERVED → PAYMENT_PROCESSED → CONFIRMED (and COMPENSATED for the failure cases).

**1:10** — Click into the **payment failure order**. Show the event timeline: ValidationService → InventoryService → PaymentService (FAILED) → CompensationService → COMPENSATED. Point out the causation chain and correlation IDs.

**1:40** — Open **Architecture → Production View**. Explain: "In production, each of these domain modules would be a separate Kubernetes Deployment consuming from a Kafka topic partition. The only thing that changes is the event transport — the business logic stays identical."

**2:05** — Go to **Failure Lab**. Drag the payment failure slider to 80%. Create a new order. Watch it fail and compensate in real-time. Explain retry behavior and DLQ.

**2:40** — Open **Design Notes**. Walk through one tradeoff: "I chose a choreography-based saga over an orchestrator because it keeps services truly independent — there's no central coordinator that becomes a single point of failure."

**3:00** — Done.

---

## Event Flow

```
OrderCreated
  └─▶ OrderValidated
        └─▶ InventoryReserved ──── (happy path) ──▶ PaymentProcessed ──▶ OrderConfirmed
              │                                            │                    └─▶ NotificationQueued ──▶ NotificationSent
              │                                            │
              └─▶ InventoryReservationFailed               └─▶ PaymentFailed
                    └─▶ CompensationStarted ◀─────────────────────────────────┘
                          └─▶ OrderCompensated + NotificationQueued

Any event: 3 retries with exponential backoff ──▶ EventDeadLettered (DLQ)
```

---

## Retry & DLQ Behavior

Every event handler is wrapped in a retry loop:

1. **Attempt 1** — process immediately  
2. **Attempt 2** — retry after `800ms`  
3. **Attempt 3** — retry after `1600ms`  
4. **MAX_RETRIES exceeded** → event copied to Dead Letter Queue, order status set to `DEAD_LETTERED`

DLQ events preserve the original payload, failure reason, and retry count. They can be replayed via the Failure Lab UI or `POST /api/dlq/:id/retry`.

---

## Idempotency

Every command includes an `idempotencyKey` (UUID, client-generated). Before processing:

1. Key is checked against a 24h idempotency table  
2. If found: return the cached result (HTTP 200, status: "DUPLICATE")  
3. If not found: process and cache the result

This prevents double-orders, double-charges, and double-shipping under network failures or client retries.

---

## CQRS: Separate Read and Write Models

**Write model** (`Order` aggregate): mutated by command handlers, normalized, strongly consistent.

**Read model** (`ProjectionOrderView`): rebuilt from events after each processing step, denormalized for fast reads, eventually consistent with the write model.

In production, the projection updater would be a separate service consuming from the `orders.events` Kafka topic, writing to Redis for sub-millisecond read latency.

---

## Deployment to Vercel

```bash
# 1. Push to GitHub
git init && git add . && git commit -m "initial"

# 2. Import to Vercel
# vercel.com/new → import repo → deploy (no env vars needed for demo mode)

# 3. For persistent storage (optional)
# Add DATABASE_URL=<neon-postgres-url> to Vercel environment variables
# The store module automatically switches to Postgres when DATABASE_URL is set
```

The app deploys as a standard Next.js application. The in-memory store works perfectly for demos. For production persistence, wire in a Neon Postgres connection — the store abstraction is designed for this swap.

> **Note on Vercel Serverless:** In production serverless deployments, each function invocation may be a different process instance, meaning in-memory state doesn't persist across cold starts. This is documented in Design Notes and is why a real Postgres connection is recommended for production.

---

## Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── dashboard/page.tsx      # Executive Dashboard (KPIs, charts, traces)
│   ├── orders/page.tsx         # Order list with live status
│   ├── orders/[id]/page.tsx    # Order detail: timeline, projection, DLQ
│   ├── architecture/page.tsx   # Runtime + Production K8s/Kafka views
│   ├── failure-lab/page.tsx    # Chaos engineering control panel
│   ├── design-notes/page.tsx   # Architecture decisions + tradeoffs
│   └── api/                    # API routes (command + query side)
├── domain/
│   ├── order.service.ts        # CreateOrder command handler
│   └── handlers.ts             # All consumer event handlers
└── lib/
    ├── types.ts                # All TypeScript domain types
    ├── store.ts                # In-memory store (global singleton)
    ├── event-bus.ts            # Event bus: publish, subscribe, retry, DLQ
    ├── seed.ts                 # Demo scenario runner
    └── utils.ts                # Formatting + status config
```

---

## Distributed Systems Concepts — Where to Look

| Concept | Location |
|---|---|
| Event bus abstraction | `src/lib/event-bus.ts` |
| Retry with exponential backoff | `event-bus.ts:processNextBatch()` |
| Dead-letter queue | `event-bus.ts:requeueDLQEvent()` |
| Idempotency guard | `src/domain/order.service.ts` |
| Saga compensation | `src/domain/handlers.ts` (CompensationStarted/PaymentFailed) |
| CQRS read model | `src/lib/store.ts:saveProjection()` |
| Correlation IDs | `Order.correlationId` propagated through all events |
| Consumer isolation | `handlers.ts:subscribe("EventType", "consumer-name", handler)` |
| Chaos engineering | `src/lib/store.ts:ChaosConfig` + `/api/chaos` |
| Event sourcing | `store.getEventsForOrder()` rebuilds full history |

---

## Resume-Ready Bullet Points

```
• Designed and implemented an event-driven order processing system modeling
  Kafka-style async workflows, CQRS, saga compensation, and DLQ patterns within
  a Vercel-deployable Next.js architecture

• Built a choreography-based distributed saga that handles partial failures
  (inventory reserved + payment declined) with automatic compensating transactions
  and zero distributed locks

• Implemented idempotent command handling with 24-hour TTL idempotency keys,
  preventing double-processing under network retries or duplicate submissions

• Created a fault injection framework (Failure Lab) for controlled chaos engineering:
  configurable payment/inventory failure rates, latency injection, consumer timeouts,
  and poison message simulation

• Designed a CQRS read/write separation where the ProjectionOrderView read model
  rebuilds from the event log, demonstrating eventual consistency in practice

• Built a retry engine with exponential backoff (3 attempts, 800ms base delay)
  and automatic DLQ routing with manual replay capability via REST API
```

---

## Tradeoffs & Future Improvements

**Current limitations:**
- In-memory store → no persistence across Vercel cold starts (fix: Neon Postgres)
- Polling instead of SSE/WebSockets for real-time updates
- Single consumer group per event type (production: multiple consumers)
- No schema registry (TypeScript types serve this purpose in monorepo)

**Future improvements:**
- Swap event bus for Upstash Kafka behind the same interface
- OpenTelemetry spans on each handler for distributed tracing
- Zod schema validation at the event bus boundary
- Consumer group offset tracking for accurate lag metrics
- Event replay from log (full event sourcing rehydration)
- Multi-tenant namespace isolation
