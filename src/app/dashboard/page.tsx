"use client";

import { useEffect, useState, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import {
  TrendingUp,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  RotateCcw,
  Play,
  Trash2,
  Zap,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatRelative, EVENT_CONFIG, STATUS_CONFIG } from "@/lib/utils";
import type { DashboardMetrics, OrderStatus } from "@/lib/types";

const STATUS_COLORS: Partial<Record<OrderStatus, string>> = {
  CONFIRMED:            "#4ade80",
  PAYMENT_FAILED:       "#f87171",
  INVENTORY_FAILED:     "#fb923c",
  COMPENSATION_STARTED: "#facc15",
  COMPENSATED:          "#71717a",
  DEAD_LETTERED:        "#ef4444",
  CREATED:              "#52525b",
  VALIDATED:            "#60a5fa",
  INVENTORY_RESERVED:   "#22d3ee",
  PAYMENT_PROCESSED:    "#a78bfa",
};

const ORDER_COUNT_OPTIONS = [5, 10, 25, 50] as const;
type OrderCount = typeof ORDER_COUNT_OPTIONS[number];

const FLOOD_OPTIONS = [50, 100, 200, 500] as const;
type FloodCount = typeof FLOOD_OPTIONS[number];

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [demoLoading, setDemoLoading]   = useState(false);
  const [demoMessage, setDemoMessage]   = useState<string | null>(null);
  const [showPicker, setShowPicker]     = useState(false);
  const [demoCount, setDemoCount]       = useState<OrderCount>(5);
  const [floodLoading, setFloodLoading] = useState(false);
  const [floodCount, setFloodCount]     = useState<FloodCount>(100);
  const [showFloodPicker, setShowFloodPicker] = useState(false);

  // ── SSE subscription (replaces polling) ───────────────────────────────────
  // EventSource auto-reconnects when the stream drops (server timeout, deploy).
  // This is the correct architecture: push not pull.
  useEffect(() => {
    let es: EventSource;

    const connect = () => {
      es = new EventSource("/api/stream");
      es.onmessage = (e: MessageEvent<string>) => {
        try {
          setMetrics(JSON.parse(e.data) as DashboardMetrics);
        } catch { /* malformed frame — skip */ }
      };
      es.onerror = () => {
        es.close();
        setTimeout(connect, 3000); // reconnect after 3s on error
      };
    };

    connect();
    return () => es?.close();
  }, []);

  // ── Close pickers on outside click ────────────────────────────────────────
  useEffect(() => {
    if (!showPicker && !showFloodPicker) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Element;
      if (!t.closest("[data-demo-picker]"))  setShowPicker(false);
      if (!t.closest("[data-flood-picker]")) setShowFloodPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker, showFloodPicker]);

  const runDemo = async (count: OrderCount) => {
    setShowPicker(false);
    setDemoLoading(true);
    setDemoMessage(null);
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      const data = await res.json() as { message: string };
      setDemoMessage(data.message);
      // SSE stream picks up new state automatically — no manual refresh needed
    } catch {
      setDemoMessage("Demo failed — check console");
    } finally {
      setDemoLoading(false);
    }
  };

  const clearData = async () => {
    await fetch("/api/demo", { method: "DELETE" });
    setDemoMessage(null);
  };

  const runFlood = async (count: FloodCount) => {
    setShowFloodPicker(false);
    setFloodLoading(true);
    setDemoMessage(null);
    try {
      const res  = await fetch("/api/load-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      const data = await res.json() as { count: number; createdMs: number; ordersPerSec: number };
      setDemoMessage(`Flood: ${data.count} orders created in ${data.createdMs}ms (${data.ordersPerSec}/s)`);
    } catch {
      setDemoMessage("Flood failed");
    } finally {
      setFloodLoading(false);
    }
  };

  const pieData = metrics
    ? Object.entries(metrics.ordersByStatus)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({
          name: STATUS_CONFIG[k as OrderStatus]?.label ?? k,
          value: v,
          color: STATUS_COLORS[k as OrderStatus] ?? "#52525b",
        }))
    : [];

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Executive Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Real-time view of the order processing pipeline
          </p>
        </div>
        <div className="flex items-center gap-3">
          {demoMessage && (
            <span className="text-xs text-green-400 font-mono">{demoMessage}</span>
          )}
          <Button variant="ghost" size="sm" onClick={clearData} disabled={demoLoading || floodLoading}>
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </Button>

          {/* Flood / Load Test button */}
          <div className="relative" data-flood-picker>
            <Button
              variant="outline"
              size="md"
              loading={floodLoading}
              onClick={() => { setShowFloodPicker((v) => !v); setShowPicker(false); }}
            >
              <Zap className="h-4 w-4 text-yellow-400" />
              Flood
              <svg className="h-3.5 w-3.5 ml-0.5" viewBox="0 0 12 12" fill="currentColor"><path d="M6 8L1 3h10L6 8z" /></svg>
            </Button>
            {showFloodPicker && !floodLoading && (
              <div className="absolute right-0 top-full mt-2 z-20 w-56 rounded-xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Orders to create</p>
                <div className="grid grid-cols-4 gap-1.5 mb-3">
                  {FLOOD_OPTIONS.map((n) => (
                    <button key={n} onClick={() => setFloodCount(n)}
                      className={`rounded-lg py-2 text-sm font-mono font-semibold transition-all ${floodCount === n ? "bg-yellow-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-600 font-mono mb-3">No draining — queue fills up, SSE shows throughput spike</p>
                <Button variant="primary" size="sm" className="w-full !bg-yellow-700 hover:!bg-yellow-600" onClick={() => runFlood(floodCount)}>
                  <Zap className="h-3.5 w-3.5" />
                  Flood {floodCount} orders
                </Button>
              </div>
            )}
          </div>

          {/* Demo button with inline count picker */}
          <div className="relative" data-demo-picker>
            <Button
              variant="primary"
              size="md"
              loading={demoLoading}
              onClick={() => setShowPicker((v) => !v)}
            >
              <Play className="h-4 w-4" />
              Run Demo
              <svg className="h-3.5 w-3.5 ml-0.5" viewBox="0 0 12 12" fill="currentColor">
                <path d="M6 8L1 3h10L6 8z" />
              </svg>
            </Button>

            {showPicker && !demoLoading && (
              <div className="absolute right-0 top-full mt-2 z-20 w-64 rounded-xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
                  Orders to generate
                </p>

                {/* Count grid */}
                <div className="grid grid-cols-4 gap-1.5 mb-4">
                  {ORDER_COUNT_OPTIONS.map((n) => (
                    <button
                      key={n}
                      onClick={() => setDemoCount(n)}
                      className={`rounded-lg py-2 text-sm font-mono font-semibold transition-all ${
                        demoCount === n
                          ? "bg-indigo-600 text-white ring-1 ring-indigo-400/50"
                          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>

                {/* Breakdown — all orders are canonical, cycling across 5 types */}
                <div className="rounded-lg bg-zinc-900 px-3 py-2 mb-3 text-xs font-mono space-y-1">
                  {(["happy", "payment-fail", "inv-fail", "idempotency", "delayed"] as const).map(
                    (label, idx) => {
                      const n = Math.floor(demoCount / 5) + (idx < demoCount % 5 ? 1 : 0);
                      return (
                        <div key={label} className="flex justify-between">
                          <span className="text-zinc-600">{label}</span>
                          <span className={n > 0 ? "text-zinc-400" : "text-zinc-700"}>×{n}</span>
                        </div>
                      );
                    }
                  )}
                  <div className="flex justify-between text-zinc-700 pt-1 border-t border-zinc-800">
                    <span>pool: 50 customers · 25 products</span>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={() => runDemo(demoCount)}
                >
                  <Play className="h-3.5 w-3.5" />
                  Generate {demoCount} orders
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          icon={<ShoppingCartIcon />}
          label="Total Orders"
          value={metrics?.totalOrders ?? 0}
          sub="all time"
        />
        <KPICard
          icon={<CheckCircle2 className="h-5 w-5 text-green-400" />}
          label="Success Rate"
          value={`${(metrics?.successRate ?? 0).toFixed(1)}%`}
          sub="confirmed / total"
          highlight={
            metrics && metrics.successRate > 0
              ? metrics.successRate >= 90
                ? "green"
                : metrics.successRate >= 60
                ? "yellow"
                : "red"
              : undefined
          }
        />
        <KPICard
          icon={<Clock className="h-5 w-5 text-blue-400" />}
          label="Avg Latency"
          value={`${metrics?.avgProcessingMs ?? 0} ms`}
          sub="end-to-end processing"
        />
        <KPICard
          icon={<AlertTriangle className="h-5 w-5 text-red-400" />}
          label="Failed Events"
          value={metrics?.failedEvents ?? 0}
          sub={`${metrics?.dlqCount ?? 0} in DLQ`}
          highlight={metrics && metrics.failedEvents > 0 ? "red" : undefined}
        />
        <KPICard
          icon={<Inbox className="h-5 w-5 text-yellow-400" />}
          label="Pending Events"
          value={metrics?.pendingEvents ?? 0}
          sub="consumer lag"
          highlight={metrics && metrics.pendingEvents > 10 ? "yellow" : undefined}
        />
        <KPICard
          icon={<RotateCcw className="h-5 w-5 text-orange-400" />}
          label="Total Retries"
          value={metrics?.totalRetries ?? 0}
          sub="exponential backoff"
        />
        <KPICard
          icon={<Activity className="h-5 w-5 text-indigo-400" />}
          label="Throughput"
          value={`${metrics?.throughputPerMinute ?? 0}/min`}
          sub="events this minute"
        />
        <KPICard
          icon={<TrendingUp className="h-5 w-5 text-cyan-400" />}
          label="Dead Letter Q"
          value={metrics?.dlqCount ?? 0}
          sub="awaiting resolution"
          highlight={metrics && metrics.dlqCount > 0 ? "red" : undefined}
        />
      </div>

      {/* Latency Percentiles */}
      {metrics?.latencyPercentiles && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <CardTitle>Processing Latency Percentiles</CardTitle>
            <span className="text-xs text-zinc-600 font-mono">{metrics.latencyPercentiles.sampleCount} samples</span>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {([
              { label: "min",  value: metrics.latencyPercentiles.min },
              { label: "p50",  value: metrics.latencyPercentiles.p50 },
              { label: "p75",  value: metrics.latencyPercentiles.p75 },
              { label: "p95",  value: metrics.latencyPercentiles.p95 },
              { label: "p99",  value: metrics.latencyPercentiles.p99 },
              { label: "max",  value: metrics.latencyPercentiles.max },
            ] as const).map(({ label, value }) => (
              <div key={label} className="text-center rounded-lg bg-zinc-900/60 py-3 px-2">
                <p className={`text-lg font-bold font-mono ${
                  label === "p99" || label === "max" ? "text-orange-400"
                  : label === "p95"                 ? "text-yellow-400"
                  : "text-zinc-200"
                }`}>{value}<span className="text-xs text-zinc-600 ml-0.5">ms</span></p>
                <p className="text-xs text-zinc-500 mt-0.5 uppercase tracking-wider">{label}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Throughput */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Event Throughput (last 10 min)</CardTitle>
          </CardHeader>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics?.eventThroughput ?? []}>
                <defs>
                  <linearGradient id="tpGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="minute"
                  tick={{ fill: "#71717a", fontSize: 10 }}
                  tickFormatter={(v: string) => v.slice(11)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#71717a", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: 8,
                    color: "#fafafa",
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#a1a1aa" }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#tpGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Orders by Status</CardTitle>
          </CardHeader>
          <div className="h-48 flex items-center">
            {pieData.length === 0 ? (
              <div className="w-full text-center text-zinc-600 text-sm">
                No orders yet — run the demo
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#18181b",
                      border: "1px solid #27272a",
                      borderRadius: 8,
                      color: "#fafafa",
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-2 space-y-1">
            {pieData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: d.color }}
                  />
                  <span className="text-zinc-400">{d.name}</span>
                </div>
                <span className="font-mono text-zinc-300">{d.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Latency by Event Type */}
      {metrics && metrics.latencyByType.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Avg Processing Latency by Event Type (ms)</CardTitle>
          </CardHeader>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.latencyByType}>
                <XAxis dataKey="type" tick={{ fill: "#71717a", fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, color: "#fafafa", fontSize: 12 }} />
                <Bar dataKey="avgMs" fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Consumer Health */}
      {metrics && metrics.consumerHealth.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Consumer Health</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {metrics.consumerHealth.map((c) => {
              const rate = c.totalProcessed > 0 ? c.successCount / c.totalProcessed : 1;
              const status = c.totalProcessed === 0 ? "idle"
                : rate >= 0.95 ? "healthy"
                : rate >= 0.8  ? "degraded"
                : "failed";
              const statusColor = status === "healthy" ? "text-green-400"
                : status === "degraded" ? "text-yellow-400"
                : status === "idle"     ? "text-zinc-600"
                : "text-red-400";
              const dotColor = status === "healthy" ? "bg-green-400"
                : status === "degraded" ? "bg-yellow-400"
                : status === "idle"     ? "bg-zinc-600"
                : "bg-red-400";
              return (
                <div key={c.consumer} className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor} ${status === "healthy" ? "animate-pulse" : ""}`} />
                    <span className="text-xs font-mono text-zinc-300 truncate">{c.consumer}</span>
                  </div>
                  <div className="space-y-0.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-600">processed</span>
                      <span className="font-mono text-zinc-300">{c.totalProcessed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600">success</span>
                      <span className={`font-mono ${statusColor}`}>
                        {c.totalProcessed > 0 ? `${(rate * 100).toFixed(0)}%` : "—"}
                      </span>
                    </div>
                    {c.avgLatencyMs > 0 && (
                      <div className="flex justify-between">
                        <span className="text-zinc-600">avg latency</span>
                        <span className="font-mono text-zinc-400">{c.avgLatencyMs}ms</span>
                      </div>
                    )}
                    {c.lastError && (
                      <p className="text-red-400 font-mono truncate mt-1" title={c.lastError}>
                        {c.lastError.slice(0, 28)}…
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Live Activity Feed */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/60">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-300">Live Activity Feed</span>
            {metrics && metrics.pendingEvents > 0 && (
              <span className="flex items-center gap-1 text-xs text-yellow-400 font-mono">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
                {metrics.pendingEvents} pending
              </span>
            )}
          </div>
          {metrics && metrics.recentEvents.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              live
            </span>
          )}
        </div>

        {!metrics || metrics.recentEvents.length === 0 ? (
          <div className="text-center py-12 text-zinc-600">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No events yet — run the demo to populate</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/30 max-h-80 overflow-y-auto">
            {metrics.recentEvents.map((event, idx) => {
              const cfg = EVENT_CONFIG[event.type];
              const isNew = idx === 0;
              return (
                <div
                  key={event.id}
                  className={`flex items-center gap-3 px-5 py-2.5 hover:bg-zinc-800/30 transition-colors ${isNew ? "animate-in" : ""}`}
                >
                  {/* Status dot */}
                  <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    event.status === "DEAD_LETTERED" ? "bg-red-500"
                    : event.status === "FAILED"      ? "bg-orange-500"
                    : cfg?.color.replace("text-", "bg-") ?? "bg-zinc-500"
                  }`} />

                  {/* Event type */}
                  <span className={`text-xs font-mono font-medium w-52 shrink-0 ${cfg?.color ?? "text-zinc-400"}`}>
                    {event.type}
                  </span>

                  {/* Order ID */}
                  <span className="text-xs text-zinc-600 font-mono w-24 shrink-0">
                    {event.aggregateId.slice(0, 8)}…
                  </span>

                  {/* Producer → Consumer */}
                  <span className="text-xs text-zinc-600 hidden lg:block">
                    {cfg?.producer}
                    {event.consumer && event.consumer !== cfg?.producer && (
                      <span className="text-zinc-700"> → {event.consumer.split(",")[0]}</span>
                    )}
                  </span>

                  {/* Latency */}
                  {event.processingLatencyMs !== null && (
                    <span className="text-xs text-zinc-700 font-mono hidden xl:block">
                      {event.processingLatencyMs}ms
                    </span>
                  )}

                  {/* Retry badge */}
                  {event.retryCount > 0 && (
                    <span className="text-xs text-orange-400 font-mono shrink-0">×{event.retryCount}</span>
                  )}

                  {/* DLQ badge */}
                  {event.status === "DEAD_LETTERED" && (
                    <span className="text-[10px] bg-red-950/60 text-red-400 rounded px-1.5 py-0.5 shrink-0">DLQ</span>
                  )}

                  <span className="ml-auto text-xs text-zinc-600 shrink-0">
                    {formatRelative(event.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ShoppingCartIcon() {
  return (
    <svg className="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  highlight?: "green" | "yellow" | "red";
}

function KPICard({ icon, label, value, sub, highlight }: KPICardProps) {
  const highlightClass = highlight === "green"
    ? "text-green-400"
    : highlight === "yellow"
    ? "text-yellow-400"
    : highlight === "red"
    ? "text-red-400"
    : "text-zinc-100";

  return (
    <Card>
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-lg bg-zinc-800/80">{icon}</div>
      </div>
      <p className={`text-2xl font-bold font-mono ${highlightClass}`}>{value}</p>
      <p className="text-xs font-medium text-zinc-400 mt-1">{label}</p>
      {sub && <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>}
    </Card>
  );
}
