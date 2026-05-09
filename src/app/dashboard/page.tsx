"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [demoLoading, setDemoLoading]   = useState(false);
  const [demoMessage, setDemoMessage]   = useState<string | null>(null);
  const [showPicker, setShowPicker]     = useState(false);
  const [demoCount, setDemoCount]       = useState<OrderCount>(5);

  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const schedulePoll = useCallback((delayMs: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      try {
        const res  = await fetch("/api/metrics");
        const data = await res.json() as DashboardMetrics;
        if (!mountedRef.current) return;
        setMetrics(data);
        // Fast while events are in-flight, back off when the system is idle.
        schedulePoll(data.pendingEvents > 0 ? 1000 : 8000);
      } catch {
        schedulePoll(5000);
      }
    }, delayMs);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    schedulePoll(0);
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [schedulePoll]);

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest("[data-demo-picker]")) setShowPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker]);

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
      schedulePoll(0);
    } catch {
      setDemoMessage("Demo failed — check console");
    } finally {
      setDemoLoading(false);
    }
  };

  const clearData = async () => {
    await fetch("/api/demo", { method: "DELETE" });
    schedulePoll(0);
    setDemoMessage(null);
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
          <Button variant="ghost" size="sm" onClick={clearData} disabled={demoLoading}>
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </Button>

          {/* Demo button with inline count picker */}
          <div className="relative" data-demo-picker>
            <Button
              variant="primary"
              size="md"
              loading={demoLoading}
              onClick={() => setShowPicker((v) => !v)}
            >
              <Play className="h-4 w-4" />
              Run Interview Demo
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
                <XAxis
                  dataKey="type"
                  tick={{ fill: "#71717a", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#71717a", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: 8,
                    color: "#fafafa",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="avgMs" fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Recent Event Traces */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Event Traces</CardTitle>
        </CardHeader>
        {!metrics || metrics.recentEvents.length === 0 ? (
          <div className="text-center py-12 text-zinc-600">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No events yet — run the demo to populate</p>
          </div>
        ) : (
          <div className="space-y-1">
            {metrics.recentEvents.slice(0, 12).map((event) => {
              const cfg = EVENT_CONFIG[event.type];
              return (
                <div
                  key={event.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-zinc-800/40 transition-colors"
                >
                  <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg?.color.replace("text-", "bg-")}`} />
                  <span className={`text-xs font-mono font-medium w-48 shrink-0 ${cfg?.color}`}>
                    {event.type}
                  </span>
                  <span className="text-xs text-zinc-600 font-mono w-32 shrink-0">
                    {event.aggregateId.slice(0, 8)}…
                  </span>
                  <span className="text-xs text-zinc-500">
                    {cfg?.producer}
                  </span>
                  <span className="ml-auto text-xs text-zinc-600">
                    {formatRelative(event.timestamp)}
                  </span>
                  {event.retryCount > 0 && (
                    <span className="text-xs text-orange-400 font-mono">
                      retry×{event.retryCount}
                    </span>
                  )}
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
