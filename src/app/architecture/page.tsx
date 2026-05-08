"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";

type Tab = "runtime" | "production";

export default function ArchitecturePage() {
  const [tab, setTab] = useState<Tab>("runtime");

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Architecture</h1>
        <p className="text-sm text-zinc-500 mt-1">
          How the system works now vs. how it would deploy at scale
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1 w-fit">
        {(["runtime", "production"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t
                ? "bg-indigo-600 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t === "runtime" ? "Runtime View" : "Production View (K8s + Kafka)"}
          </button>
        ))}
      </div>

      {tab === "runtime" ? <RuntimeView /> : <ProductionView />}
    </div>
  );
}

// ─── Runtime View ─────────────────────────────────────────────────────────────

function RuntimeView() {
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-sm font-semibold text-zinc-300 mb-4">
          Current Runtime: Modular Monolith with Event-Driven Internals
        </h2>
        <div className="overflow-x-auto">
          <RuntimeDiagram />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[
          {
            title: "Command Side (Write)",
            color: "border-indigo-800/50 bg-indigo-950/20",
            items: [
              "POST /api/orders → CreateOrder command",
              "Idempotency check before processing",
              "Order aggregate created & persisted",
              "OrderCreated event emitted to bus",
              "HTTP 201 returned immediately",
            ],
          },
          {
            title: "Event Bus",
            color: "border-zinc-700/50 bg-zinc-900/40",
            items: [
              "In-memory FIFO queue (module-level)",
              "Typed handler registry per event type",
              "Exponential backoff retry (3×)",
              "DLQ after max retries exceeded",
              "Idempotent consumer enforcement",
            ],
          },
          {
            title: "Query Side (Read)",
            color: "border-cyan-800/50 bg-cyan-950/20",
            items: [
              "ProjectionOrderView built from events",
              "Updated after each event processing",
              "Served via GET /api/orders (CQRS)",
              "Separate from command model",
              "Eventually consistent with write model",
            ],
          },
        ].map((box) => (
          <div
            key={box.title}
            className={`rounded-xl border p-4 ${box.color}`}
          >
            <h3 className="text-sm font-semibold text-zinc-300 mb-3">
              {box.title}
            </h3>
            <ul className="space-y-1.5">
              {box.items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-zinc-400">
                  <span className="text-indigo-500 mt-0.5">›</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <Card>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Event Flow</h3>
        <EventFlowDiagram />
      </Card>
    </div>
  );
}

// ─── Production View ──────────────────────────────────────────────────────────

function ProductionView() {
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-sm font-semibold text-zinc-300 mb-1">
          Production Mapping: Kubernetes + Apache Kafka
        </h2>
        <p className="text-xs text-zinc-500 mb-4">
          Exactly how this system would be decomposed and deployed in a real infrastructure
        </p>
        <div className="overflow-x-auto">
          <ProductionDiagram />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Kafka Topic Design</h3>
          <div className="space-y-2">
            {[
              { topic: "orders.commands",     partitions: 12, retention: "7d",  consumers: "order-service" },
              { topic: "orders.events",       partitions: 24, retention: "30d", consumers: "inventory, payment, notification, projection" },
              { topic: "orders.dlq",          partitions: 3,  retention: "90d", consumers: "dlq-processor, ops-dashboard" },
              { topic: "notifications.queue", partitions: 6,  retention: "3d",  consumers: "notification-service" },
            ].map((t) => (
              <div key={t.topic} className="rounded-lg bg-zinc-900 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-indigo-300">{t.topic}</span>
                  <div className="flex gap-2">
                    <span className="text-[10px] bg-zinc-800 rounded px-1.5 py-0.5 text-zinc-400">
                      {t.partitions}p
                    </span>
                    <span className="text-[10px] bg-zinc-800 rounded px-1.5 py-0.5 text-zinc-400">
                      ret:{t.retention}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-600">Consumers: {t.consumers}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Kubernetes Workloads</h3>
          <div className="space-y-2">
            {[
              { name: "order-api",           kind: "Deployment", replicas: "3",    hpa: "2–10", cpu: "200m" },
              { name: "inventory-worker",    kind: "Deployment", replicas: "2",    hpa: "1–6",  cpu: "150m" },
              { name: "payment-worker",      kind: "Deployment", replicas: "2",    hpa: "1–4",  cpu: "200m" },
              { name: "notification-worker", kind: "Deployment", replicas: "1",    hpa: "1–3",  cpu: "100m" },
              { name: "projection-updater",  kind: "Deployment", replicas: "2",    hpa: "1–4",  cpu: "100m" },
              { name: "dlq-processor",       kind: "CronJob",    replicas: "—",    hpa: "—",    cpu: "50m" },
            ].map((w) => (
              <div key={w.name} className="flex items-center justify-between rounded-lg bg-zinc-900 px-3 py-2.5">
                <div>
                  <span className="font-mono text-xs text-zinc-300">{w.name}</span>
                  <span className="ml-2 text-[10px] text-zinc-600">{w.kind}</span>
                </div>
                <div className="flex gap-2 text-[10px] text-zinc-500 font-mono">
                  <span>{w.replicas !== "—" ? `×${w.replicas}` : "cron"}</span>
                  {w.hpa !== "—" && <span className="text-cyan-600">HPA:{w.hpa}</span>}
                  <span className="text-zinc-600">{w.cpu}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">
            Production vs. Demo: What Changes
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-2 pr-4 text-zinc-500 font-medium">Concern</th>
                  <th className="text-left py-2 pr-4 text-zinc-500 font-medium">This Demo</th>
                  <th className="text-left py-2 text-zinc-500 font-medium">Production</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {[
                  ["Event Transport", "In-memory module singleton", "Apache Kafka / Upstash Kafka"],
                  ["Consumer Workers", "Next.js route handlers", "Kubernetes Deployments (dedicated pods)"],
                  ["Data Store", "In-memory Maps", "PostgreSQL (Neon / Aurora)"],
                  ["Read Model", "Same-process projection", "Separate projection service + Redis cache"],
                  ["Retry / DLQ", "Simulated in-process", "Kafka consumer offsets + retry topics"],
                  ["Observability", "In-app metrics", "Datadog / OpenTelemetry + Grafana"],
                  ["Schema Registry", "TypeScript types", "Confluent Schema Registry (Avro)"],
                  ["Auth & ACL", "None (demo)", "OAuth2 + RBAC + Kafka ACLs"],
                  ["Scaling", "Single process", "HPA on consumer groups, partition-based parallelism"],
                ].map(([concern, demo, prod]) => (
                  <tr key={concern}>
                    <td className="py-2 pr-4 text-zinc-400 font-medium">{concern}</td>
                    <td className="py-2 pr-4 text-zinc-500 font-mono">{demo}</td>
                    <td className="py-2 text-indigo-300 font-mono">{prod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── SVG Diagrams ─────────────────────────────────────────────────────────────

function RuntimeDiagram() {
  // Consumer centers (box x + half-width): 115, 240, 365, 490, 615
  const consumers = [
    { x: 60,  cx: 115, label: "Validation",   fill: "#1e3a5f", stroke: "#3b82f6" },
    { x: 185, cx: 240, label: "Inventory",    fill: "#1c3a2a", stroke: "#22c55e" },
    { x: 310, cx: 365, label: "Payment",      fill: "#2d1f3d", stroke: "#a855f7" },
    { x: 435, cx: 490, label: "Notification", fill: "#1c2e3a", stroke: "#06b6d4" },
    { x: 560, cx: 615, label: "Compensation", fill: "#3a2a1c", stroke: "#f97316" },
  ];

  return (
    <svg viewBox="0 0 760 285" className="w-full max-w-4xl" fill="none">
      {/* ── defs first so markers are available to all elements ── */}
      <defs>
        <marker id="arrow-indigo" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#6366f1" />
        </marker>
        <marker id="arrow-gray" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L7,3 z" fill="#4b5563" />
        </marker>
      </defs>

      {/* ── Top row: Client → API Layer → Event Bus ── */}
      <rect x="10" y="10" width="110" height="55" rx="8" fill="#18181b" stroke="#3f3f46" />
      <text x="65" y="35" textAnchor="middle" fill="#a1a1aa" fontSize="11" fontWeight="600">Client</text>
      <text x="65" y="52" textAnchor="middle" fill="#71717a" fontSize="9">Browser / API</text>

      <rect x="160" y="10" width="145" height="55" rx="8" fill="#1e1b4b" stroke="#4f46e5" />
      <text x="232" y="35" textAnchor="middle" fill="#a5b4fc" fontSize="11" fontWeight="600">API Layer</text>
      <text x="232" y="52" textAnchor="middle" fill="#6366f1" fontSize="9">Next.js Route Handlers</text>

      <rect x="350" y="10" width="155" height="55" rx="8" fill="#18181b" stroke="#6366f1" strokeDasharray="4 2" />
      <text x="427" y="35" textAnchor="middle" fill="#a1a1aa" fontSize="11" fontWeight="600">Event Bus</text>
      <text x="427" y="52" textAnchor="middle" fill="#71717a" fontSize="9">In-Memory FIFO Queue</text>

      {/* Horizontal arrows: Client → API → Bus */}
      <line x1="121" y1="37" x2="158" y2="37" stroke="#4f46e5" strokeWidth="1.5" markerEnd="url(#arrow-indigo)" />
      <text x="139" y="32" textAnchor="middle" fill="#4f46e5" fontSize="7.5">HTTP</text>

      <line x1="306" y1="37" x2="348" y2="37" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="4 2" markerEnd="url(#arrow-indigo)" />
      <text x="327" y="32" textAnchor="middle" fill="#6366f1" fontSize="7.5">publish()</text>

      {/* ── Bus → distribution bar → consumers ──
           Drop from bus bottom-center (427, 65) to the bus bar at y=100.
           Then span bar across all consumer centers (115 → 615).
           Then drop from bar to each consumer top (y=120).
      */}
      {/* Vertical stem from bus bottom to bar */}
      <line x1="427" y1="65" x2="427" y2="100" stroke="#6366f1" strokeWidth="1.5" />

      {/* Horizontal distribution bar */}
      <line x1="115" y1="100" x2="615" y2="100" stroke="#4b5563" strokeWidth="1" />

      {/* Vertical drops from bar to each consumer, with arrowhead */}
      {consumers.map((c) => (
        <line key={c.label} x1={c.cx} y1="100" x2={c.cx} y2="118" stroke="#4b5563" strokeWidth="1" markerEnd="url(#arrow-gray)" />
      ))}

      {/* ── Consumer boxes ── */}
      {consumers.map((c) => (
        <g key={c.label}>
          <rect x={c.x} y="120" width="110" height="50" rx="6" fill={c.fill} stroke={c.stroke} />
          <text x={c.cx} y="143" textAnchor="middle" fill="#d1d5db" fontSize="9" fontWeight="600">{c.label}</text>
          <text x={c.cx} y="158" textAnchor="middle" fill="#6b7280" fontSize="8">consumer</text>
        </g>
      ))}

      {/* ── Stores ── */}
      <rect x="60" y="215" width="185" height="52" rx="6" fill="#111" stroke="#27272a" />
      <text x="152" y="238" textAnchor="middle" fill="#a1a1aa" fontSize="10" fontWeight="600">Projection Store</text>
      <text x="152" y="254" textAnchor="middle" fill="#52525b" fontSize="8">ProjectionOrderView (read model)</text>

      <rect x="275" y="215" width="160" height="52" rx="6" fill="#111" stroke="#27272a" />
      <text x="355" y="238" textAnchor="middle" fill="#a1a1aa" fontSize="10" fontWeight="600">Event Log</text>
      <text x="355" y="254" textAnchor="middle" fill="#52525b" fontSize="8">DomainEvent[ ] + DLQ</text>

      {/* Consumer → Store arrows (Validation → Projection, Payment → Event Log) */}
      <line x1="115" y1="171" x2="115" y2="213" stroke="#4b5563" strokeWidth="1" markerEnd="url(#arrow-gray)" />
      <line x1="365" y1="171" x2="365" y2="213" stroke="#4b5563" strokeWidth="1" markerEnd="url(#arrow-gray)" />
    </svg>
  );
}

function ProductionDiagram() {
  // ── Layout constants ──────────────────────────────────────────────────────
  // Workers: x=510, w=140, h=42, gap=10 → step=52
  // Centers: cy = y + 21
  const WORKER_X  = 510;
  const WORKER_W  = 140;
  const WORKER_H  = 42;
  const WORKER_RX = WORKER_X + WORKER_W; // 650

  const workers = [
    { y: 8,   label: "validation-service",  sub: "consumer-grp: commands",  fill: "#1e3a5f", stroke: "#3b82f6" },
    { y: 60,  label: "inventory-worker",    sub: "consumer-grp: events",    fill: "#1c3a2a", stroke: "#22c55e" },
    { y: 112, label: "payment-worker",      sub: "consumer-grp: events",    fill: "#2d1f3d", stroke: "#a855f7" },
    { y: 164, label: "notification-worker", sub: "consumer-grp: notif.q",   fill: "#1c2e3a", stroke: "#06b6d4" },
    { y: 216, label: "compensation-svc",    sub: "consumer-grp: events",    fill: "#3a2a1c", stroke: "#f97316" },
    { y: 268, label: "projection-updater",  sub: "consumer-grp: events",    fill: "#1c1c3a", stroke: "#818cf8" },
    { y: 320, label: "dlq-processor",       sub: "consumer-grp: dlq",       fill: "#2a1c1c", stroke: "#f43f5e" },
  ];
  // Worker CYs: 29, 81, 133, 185, 237, 289, 341
  // Kafka spans y=8 to y=362 → fully covers all workers

  // Distribution bar sits between Kafka right edge (480) and workers (510)
  const BAR_X    = 494;
  const BAR_TOP  = 29;   // first worker cy
  const BAR_BOT  = 341;  // last worker cy

  // Stores: x=690, w=125, gap=12
  const STORE_X  = 690;
  const STORE_W  = 125;
  const STORE_LX = STORE_X; // left edge

  const stores = [
    { y: 40,  h: 52, label: "PostgreSQL",    sub: "Neon / Aurora",   stroke: "#374151" },
    { y: 112, h: 52, label: "Redis",         sub: "Projections/Cache",stroke: "#374151" },
    { y: 184, h: 52, label: "Observability", sub: "OTel + Datadog",   stroke: "#374151" },
  ];
  // Store CYs: 66, 138, 210

  // Worker → Store routing (worker index → store index)
  // inventory(1)→PG(0), payment(2)→PG(0), compensation(4)→PG(0)
  // projection(5)→Redis(1), dlq(6)→Observability(2)
  // All workers implicitly → Observability via OTel sidecar (shown as dashed)
  const storeArrows: Array<{ wi: number; si: number; dashed?: boolean }> = [
    { wi: 0, si: 0 },  // validation → PG (command store)
    { wi: 1, si: 0 },  // inventory  → PG
    { wi: 2, si: 0 },  // payment    → PG
    { wi: 4, si: 0 },  // compensation → PG
    { wi: 5, si: 1 },  // projection → Redis
    { wi: 3, si: 2 },  // notification → Observability (audit log)
    { wi: 6, si: 2 },  // dlq        → Observability (alerting)
  ];

  const wcy = (i: number) => workers[i].y + WORKER_H / 2;
  const scy = (i: number) => stores[i].y + stores[i].h / 2;

  return (
    <svg viewBox="0 0 950 380" className="w-full max-w-5xl" fill="none">
      {/* ── defs first ── */}
      <defs>
        <marker id="p-arr-blue"   markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#6366f1" />
        </marker>
        <marker id="p-arr-amber"  markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#d97706" />
        </marker>
        <marker id="p-arr-gray"   markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L7,3 z" fill="#4b5563" />
        </marker>
        <marker id="p-arr-dim"    markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L7,3 z" fill="#374151" />
        </marker>
      </defs>

      {/* ── Ingress ─────────────────────────────── x=10, cy=185 ── */}
      <rect x="10" y="158" width="82" height="54" rx="6" fill="#18181b" stroke="#3f3f46" />
      <text x="51" y="182" textAnchor="middle" fill="#a1a1aa" fontSize="10" fontWeight="600">Ingress</text>
      <text x="51" y="197" textAnchor="middle" fill="#52525b" fontSize="8">NGINX / ALB</text>
      <text x="51" y="209" textAnchor="middle" fill="#3f3f46" fontSize="7">TLS · rate-limit</text>

      {/* ── API Pods ───────────────────────── x=112, cy≈185 ── */}
      <rect x="112" y="100" width="148" height="180" rx="8" fill="#1e1b4b" stroke="#4f46e5" />
      <text x="186" y="124" textAnchor="middle" fill="#a5b4fc" fontSize="11" fontWeight="600">API Pods</text>
      {[
        { label: "order-api × 3",      fill: "#312e81" },
        { label: "HPA: 3–10 replicas", fill: "#312e81" },
        { label: "ConfigMap + Secrets", fill: "#312e81" },
        { label: "Readiness probe",     fill: "#1e1b4b", stroke: "#312e81" },
      ].map((row, i) => (
        <g key={row.label}>
          <rect x="126" y={134 + i * 32} width="120" height="24" rx="4"
            fill={row.fill} stroke={row.stroke ?? "none"} />
          <text x="186" y={150 + i * 32} textAnchor="middle" fill="#c7d2fe" fontSize="8">
            {row.label}
          </text>
        </g>
      ))}

      {/* ── Kafka ────────────────── x=282, spans full worker height ── */}
      <rect x="282" y="8" width="194" height="358" rx="8" fill="#0c0a09" stroke="#92400e" />
      <text x="379" y="30" textAnchor="middle" fill="#fbbf24" fontSize="11" fontWeight="600">
        Apache Kafka
      </text>
      <text x="379" y="44" textAnchor="middle" fill="#78350f" fontSize="8">
        Schema Registry · ZooKeeper
      </text>

      {/* Topic rows inside Kafka */}
      {[
        { label: "orders.commands",      sub: "12 partitions · key=orderId", top: 58  },
        { label: "orders.events",        sub: "24 partitions · key=orderId", top: 118 },
        { label: "notifications.queue",  sub: "6 partitions · key=custId",   top: 178 },
        { label: "orders.dlq",           sub: "3 partitions · manual commit", top: 238 },
      ].map((t) => (
        <g key={t.label}>
          <rect x="296" y={t.top} width="166" height="48" rx="4" fill="#1c1917" stroke="#44403c" />
          <text x="379" y={t.top + 18} textAnchor="middle" fill="#fde68a" fontSize="8.5" fontFamily="monospace" fontWeight="600">
            {t.label}
          </text>
          <text x="379" y={t.top + 33} textAnchor="middle" fill="#78716c" fontSize="7.5" fontFamily="monospace">
            {t.sub}
          </text>
        </g>
      ))}

      {/* Kafka footer: replication note */}
      <text x="379" y="322" textAnchor="middle" fill="#44403c" fontSize="7.5">replication-factor: 3</text>
      <text x="379" y="335" textAnchor="middle" fill="#44403c" fontSize="7.5">min.insync.replicas: 2</text>
      <text x="379" y="348" textAnchor="middle" fill="#44403c" fontSize="7.5">retention: 7d (events) · 90d (dlq)</text>

      {/* ── Distribution bar (Kafka right → workers) ── */}
      {/* Horizontal stem from Kafka right-center to the vertical bar */}
      <line x1="476" y1="185" x2={BAR_X} y2="185" stroke="#4b5563" strokeWidth="1" />
      {/* Vertical distribution bar */}
      <line x1={BAR_X} y1={BAR_TOP} x2={BAR_X} y2={BAR_BOT} stroke="#4b5563" strokeWidth="1" />
      {/* Tick marks + arrows from bar to each worker */}
      {workers.map((w, i) => {
        const cy = w.y + WORKER_H / 2;
        return (
          <line key={w.label}
            x1={BAR_X} y1={cy}
            x2={WORKER_X - 2} y2={cy}
            stroke="#4b5563" strokeWidth="1"
            markerEnd="url(#p-arr-gray)"
          />
        );
      })}

      {/* "consume" label */}
      <text x="492" y="177" fill="#4b5563" fontSize="7" fontFamily="monospace">consume</text>

      {/* ── Worker Pods ── */}
      {workers.map((w) => {
        const cy = w.y + WORKER_H / 2;
        return (
          <g key={w.label}>
            <rect x={WORKER_X} y={w.y} width={WORKER_W} height={WORKER_H}
              rx="5" fill={w.fill} stroke={w.stroke} />
            <text x={WORKER_X + WORKER_W / 2} y={cy - 5}
              textAnchor="middle" fill="#e5e7eb" fontSize="9" fontWeight="600">
              {w.label}
            </text>
            <text x={WORKER_X + WORKER_W / 2} y={cy + 9}
              textAnchor="middle" fill="#6b7280" fontSize="7" fontFamily="monospace">
              {w.sub}
            </text>
          </g>
        );
      })}

      {/* ── Data Stores ── */}
      {stores.map((s) => {
        const cy = s.y + s.h / 2;
        return (
          <g key={s.label}>
            <rect x={STORE_X} y={s.y} width={STORE_W} height={s.h}
              rx="6" fill="#111" stroke={s.stroke} />
            <text x={STORE_X + STORE_W / 2} y={cy - 6}
              textAnchor="middle" fill="#a1a1aa" fontSize="10" fontWeight="600">
              {s.label}
            </text>
            <text x={STORE_X + STORE_W / 2} y={cy + 9}
              textAnchor="middle" fill="#52525b" fontSize="7.5">
              {s.sub}
            </text>
          </g>
        );
      })}

      {/* ── Worker → Store arrows ── */}
      {storeArrows.map(({ wi, si, dashed }) => (
        <line key={`${wi}-${si}`}
          x1={WORKER_RX}     y1={wcy(wi)}
          x2={STORE_LX - 2}  y2={scy(si)}
          stroke="#374151" strokeWidth="1"
          strokeDasharray={dashed ? "3 2" : undefined}
          markerEnd="url(#p-arr-dim)"
        />
      ))}

      {/* ── Ingress → API Pods ── */}
      <line x1="92" y1="185" x2="110" y2="185"
        stroke="#6366f1" strokeWidth="1.5" markerEnd="url(#p-arr-blue)" />
      <text x="101" y="180" textAnchor="middle" fill="#6366f1" fontSize="7">HTTPS</text>

      {/* ── API Pods → Kafka (produce) ── */}
      <line x1="260" y1="185" x2="280" y2="185"
        stroke="#d97706" strokeWidth="1.5" strokeDasharray="5 2" markerEnd="url(#p-arr-amber)" />
      <text x="270" y="179" textAnchor="middle" fill="#d97706" fontSize="7">produce</text>

      {/* ── API Pods → Kafka (query path back) — faint, upward ── */}
      <line x1="260" y1="170" x2="280" y2="155"
        stroke="#374151" strokeWidth="1" strokeDasharray="3 2" markerEnd="url(#p-arr-dim)" />
      <text x="270" y="157" textAnchor="middle" fill="#374151" fontSize="7">read-model</text>
    </svg>
  );
}

function EventFlowDiagram() {
  // State boxes: width=150, gap=14px between boxes. x = 10 + i*164.
  const states = [
    { label: "OrderCreated",     color: "#52525b" },
    { label: "OrderValidated",   color: "#3b82f6" },
    { label: "InventoryReserved",color: "#06b6d4" },
    { label: "PaymentProcessed", color: "#a855f7" },
    { label: "OrderConfirmed",   color: "#22c55e" },
  ];

  // `after` = index of the state whose handler produces this failure.
  // OrderCreated (0) → validation → ValidationFailed
  // OrderValidated (1) → inventory → InventoryFailed
  // InventoryReserved (2) → payment → PaymentFailed
  const failures = [
    { after: 0, label: "ValidationFailed", color: "#f97316" },
    { after: 1, label: "InventoryFailed",  color: "#f97316" },
    { after: 2, label: "PaymentFailed",    color: "#ef4444" },
  ];

  const BOX_W = 150;
  const GAP   = 14;
  const STEP  = BOX_W + GAP; // 164

  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 860 185" className="w-full max-w-4xl" fill="none">
        {/* ── defs first ── */}
        <defs>
          <marker id="ev-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill="#4b5563" />
          </marker>
          <marker id="ev-arrow-fail" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill="#4b5563" />
          </marker>
        </defs>

        {/* ── Happy-path state boxes + arrows between them ── */}
        {states.map((s, i) => {
          const x = 10 + i * STEP;
          const cx = x + BOX_W / 2;
          return (
            <g key={s.label}>
              <rect x={x} y="20" width={BOX_W} height="40" rx="6" fill="#18181b" stroke={s.color} />
              <text x={cx} y="45" textAnchor="middle" fill={s.color} fontSize="9" fontFamily="monospace" fontWeight="600">
                {s.label}
              </text>
              {/* Arrow to next state: from right edge of box i to left edge of box i+1 */}
              {i < states.length - 1 && (
                <line
                  x1={x + BOX_W}
                  y1="40"
                  x2={x + BOX_W + GAP - 1}
                  y2="40"
                  stroke="#4b5563"
                  strokeWidth="1.5"
                  markerEnd="url(#ev-arrow)"
                />
              )}
            </g>
          );
        })}

        {/* ── Failure branches ── */}
        {failures.map((f) => {
          const stateX  = 10 + f.after * STEP;       // left edge of triggering state
          const stateCX = stateX + BOX_W / 2;         // center x of triggering state
          const boxX    = stateX;                      // failure box aligned under same state
          const boxCX   = boxX + BOX_W / 2;
          return (
            <g key={f.label}>
              {/* Vertical dashed drop from bottom of state box to top of failure box */}
              <line
                x1={stateCX} y1="60"
                x2={stateCX} y2="93"
                stroke="#4b5563" strokeWidth="1" strokeDasharray="3 2"
              />
              {/* Failure box */}
              <rect x={boxX} y="95" width={BOX_W} height="34" rx="5" fill="#18181b" stroke={f.color} />
              <text x={boxCX} y="116" textAnchor="middle" fill={f.color} fontSize="8.5" fontFamily="monospace">
                {f.label}
              </text>
              {/* Dashed arrow to Compensation box (left edge x=690) */}
              <line
                x1={boxX + BOX_W} y1="112"
                x2="688"          y2="150"
                stroke="#4b5563" strokeWidth="1" strokeDasharray="3 2"
                markerEnd="url(#ev-arrow-fail)"
              />
            </g>
          );
        })}

        {/* ── Compensation box ── */}
        <rect x="690" y="133" width="158" height="42" rx="6" fill="#292524" stroke="#78716c" />
        <text x="769" y="152" textAnchor="middle" fill="#d6d3d1" fontSize="9" fontFamily="monospace" fontWeight="600">
          CompensationStarted
        </text>
        <text x="769" y="167" textAnchor="middle" fill="#a8a29e" fontSize="8" fontFamily="monospace">
          → OrderCompensated
        </text>
      </svg>
    </div>
  );
}
