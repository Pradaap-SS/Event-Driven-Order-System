import { Card } from "@/components/ui/card";

export default function DesignNotesPage() {
  return (
    <div className="p-8 max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Design Notes</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Architectural decisions, tradeoffs, and engineering context
        </p>
      </div>

      <Section title="Why This Architecture?">
        <p>
          This system demonstrates that event-driven architecture principles—idempotency,
          at-least-once delivery, saga compensation, and DLQ—can be expressed cleanly in a
          modular monolith before any infrastructure exists. The goal is to show that the
          <em>concepts</em> matter more than the infrastructure they run on.
        </p>
        <p className="mt-3">
          In production, every &quot;module&quot; here (order, inventory, payment, notification,
          compensation) would become an independent Kubernetes Deployment consuming from a
          dedicated Kafka consumer group. The only change would be swapping the in-process
          event bus for a Kafka producer/consumer. The business logic stays identical.
        </p>
      </Section>

      <Section title="Key Engineering Decisions">
        <dl className="space-y-4">
          {[
            {
              term: "Modular Monolith over Fake Microservices",
              def: "Splitting into actual processes for a demo would add Docker Compose, networking, and operational overhead with no additional design insight. The event bus abstraction cleanly separates concerns. When scaling is needed, the extraction path is obvious: each handler module → its own service.",
            },
            {
              term: "At-Least-Once Delivery Model",
              def: "All consumers are written to be idempotent. The event bus may deliver an event more than once (especially after retries). Each handler checks state before acting—e.g., if an order is already CONFIRMED, processing a duplicate PaymentProcessed event is a no-op. This is the correct assumption for any reliable message system.",
            },
            {
              term: "CQRS: Separate Write and Read Models",
              def: "The Order aggregate (write model) is mutated by command handlers. The ProjectionOrderView (read model) is rebuilt from events and served on the query side. This means read performance is decoupled from write complexity. At scale, the projection can be denormalized into Redis for sub-millisecond reads.",
            },
            {
              term: "Saga Pattern for Distributed Transactions",
              def: "There is no distributed transaction. Instead, each step publishes an event, and failures trigger compensating transactions. InventoryReservationFailed → CompensationStarted → OrderCompensated. This is the Choreography-based saga pattern: no central orchestrator, no 2PC, no SAGA coordinator table needed.",
            },
            {
              term: "Exponential Backoff + DLQ",
              def: "Failed events are retried 3 times with BASE_DELAY * 2^retryCount milliseconds between attempts. After max retries, the event is moved to the Dead Letter Queue with the failure reason preserved. DLQ events can be replayed manually once the underlying issue is resolved—this is exactly how production Kafka retry topics work.",
            },
            {
              term: "Idempotency Keys",
              def: "Every command includes an idempotency key (client-provided or auto-generated). Before processing, the system checks if this key has been used in the last 24 hours. Duplicates return the original result without side effects. This prevents double-charging and double-shipping under network failures.",
            },
            {
              term: "Correlation IDs for Distributed Tracing",
              def: "Every order gets a correlationId at creation time, which flows through every subsequent event in that order's lifecycle. This allows reconstructing a full trace across services—equivalent to what OpenTelemetry trace propagation achieves in a real distributed system.",
            },
          ].map((item) => (
            <div key={item.term}>
              <dt className="text-sm font-semibold text-indigo-300 mb-1">{item.term}</dt>
              <dd className="text-sm text-zinc-400 leading-relaxed">{item.def}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Tradeoffs & Known Limitations">
        <div className="space-y-3">
          {[
            {
              title: "In-Memory Store vs. Persistent Database",
              text: "The in-memory store resets on process restart and doesn't survive Vercel cold starts between different function instances. For demos this is fine—the dev server keeps state alive for the entire session. For production, replace the store module with a Postgres-backed implementation behind the same interface. The API layer never touches storage directly.",
              tag: "demo constraint",
            },
            {
              title: "Polling vs. Server-Sent Events",
              text: "The dashboard polls /api/metrics every 1.5s and the event processor is called every 600ms. In production, this would use Server-Sent Events or WebSockets for real-time push. Polling was chosen to keep the demo dependency-free and SSR-compatible.",
              tag: "simplification",
            },
            {
              title: "Single Consumer Group",
              text: "Each event type has one handler registered. In production, multiple services would consume the same event (e.g., both analytics and notification services consuming OrderConfirmed). The bus supports multiple handlers per type; this is straightforward to extend.",
              tag: "scope",
            },
            {
              title: "No Schema Registry",
              text: "Event schemas are enforced only by TypeScript types. In production with Kafka, schemas would be registered in Confluent Schema Registry (Avro or Protobuf) to prevent breaking changes from propagating to consumers. The EventType union type here serves the same purpose within a single codebase.",
              tag: "production gap",
            },
          ].map((t) => (
            <div key={t.title} className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-sm font-medium text-zinc-200">{t.title}</h4>
                <span className="shrink-0 text-[10px] rounded px-2 py-0.5 bg-zinc-800 text-zinc-500 font-mono">
                  {t.tag}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-2 leading-relaxed">{t.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="What Changes at Scale">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left pb-3 text-xs text-zinc-500 uppercase font-medium">Scale tier</th>
                <th className="text-left pb-3 text-xs text-zinc-500 uppercase font-medium">Event transport</th>
                <th className="text-left pb-3 text-xs text-zinc-500 uppercase font-medium">Workers</th>
                <th className="text-left pb-3 text-xs text-zinc-500 uppercase font-medium">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {[
                ["Demo / Local", "In-memory bus", "Next.js API routes", "Module-level Maps"],
                ["Startup (~1k orders/day)", "Upstash Kafka", "Vercel Functions", "Neon Postgres"],
                ["Growth (~100k orders/day)", "Confluent Kafka", "K8s Deployments, HPA 1–10", "Aurora RDS + Redis cache"],
                ["Enterprise (>1M/day)", "Kafka + MSK, multi-AZ", "K8s with KEDA autoscaling", "CockroachDB + Kafka Streams"],
              ].map(([tier, transport, workers, state]) => (
                <tr key={tier}>
                  <td className="py-3 text-zinc-300 font-medium">{tier}</td>
                  <td className="py-3 text-zinc-500 font-mono text-xs">{transport}</td>
                  <td className="py-3 text-zinc-500 font-mono text-xs">{workers}</td>
                  <td className="py-3 text-zinc-500 font-mono text-xs">{state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Distributed Systems Concepts — Code Location">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            { concept: "Event Bus Abstraction", file: "src/lib/event-bus.ts" },
            { concept: "Retry + Backoff", file: "event-bus.ts:processNextBatch()" },
            { concept: "Dead Letter Queue", file: "event-bus.ts:requeueDLQEvent()" },
            { concept: "Idempotency", file: "src/domain/order.service.ts" },
            { concept: "Saga Compensation", file: "src/domain/handlers.ts:compensation" },
            { concept: "CQRS Read Model", file: "src/lib/store.ts:projections" },
            { concept: "Correlation IDs", file: "Order.correlationId → all events" },
            { concept: "Consumer Isolation", file: "handlers.ts:subscribe() per type" },
            { concept: "Chaos Engineering", file: "src/lib/store.ts:ChaosConfig" },
            { concept: "Event Sourcing", file: "store.getEventsForOrder()" },
          ].map(({ concept, file }) => (
            <div key={concept} className="flex items-start gap-2 rounded-lg bg-zinc-900 px-3 py-2">
              <span className="text-indigo-400 text-sm">›</span>
              <div>
                <p className="text-sm text-zinc-300">{concept}</p>
                <p className="text-xs text-zinc-600 font-mono">{file}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Future Improvements">
        <ul className="space-y-2 text-sm text-zinc-400">
          {[
            "Swap in-memory store for Neon Postgres using the same Store interface",
            "Replace polling with Server-Sent Events for true real-time updates",
            "Add Upstash Kafka integration behind the EventBus abstraction",
            "Implement consumer group offset tracking (like Kafka consumer lag)",
            "Add OpenTelemetry spans to each event handler for full distributed tracing",
            "Schema validation with Zod at the event bus boundary",
            "Event versioning and backward-compatibility contracts",
            "Multi-tenant support with tenant-isolated event namespacing",
            "Webhook delivery for external system notifications",
            "Full replay from event log (event sourcing rehydration)",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="text-zinc-600 mt-0.5">○</span>
              {item}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <h2 className="text-base font-semibold text-zinc-200 mb-4 pb-3 border-b border-zinc-800/60">
        {title}
      </h2>
      <div className="text-sm text-zinc-400 leading-relaxed">{children}</div>
    </Card>
  );
}
