"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Zap,
  CreditCard,
  Package,
  Timer,
  Skull,
  RotateCcw,
  RefreshCw,
  FlaskConical,
  ArrowRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { formatRelative, formatCurrency, EVENT_CONFIG } from "@/lib/utils";
import type { ChaosConfig, DeadLetterEvent, Order } from "@/lib/types";

const SAMPLE_ITEMS = [
  { sku: "SKU-A100", name: "Wireless Headset Pro",   unitPrice: 149.99 },
  { sku: "SKU-C300", name: "4K Webcam Ultra",         unitPrice: 199.0 },
  { sku: "SKU-F600", name: "Standing Desk Converter", unitPrice: 349.0 },
];

export default function FailureLabPage() {
  const [chaos, setChaos] = useState<ChaosConfig>({
    paymentFailureRate: 0,
    inventoryFailureRate: 0,
    processingDelayMs: 0,
    duplicateEventRate: 0,
    consumerTimeoutRate: 0,
    poisonMessageEnabled: false,
  });
  const [dlq, setDlq] = useState<DeadLetterEvent[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [firing, setFiring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fireResult, setFireResult] = useState<{ orderId: string; status: string } | null>(null);

  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const poll = useCallback((delayMs: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      try {
        const [chaosRes, dlqRes, ordersRes] = await Promise.all([
          fetch("/api/chaos"),
          fetch("/api/dlq"),
          fetch("/api/orders"),
        ]);
        if (!chaosRes.ok || !dlqRes.ok || !ordersRes.ok) { poll(5000); return; }
        const dlqData    = await dlqRes.json() as { events: DeadLetterEvent[] };
        const ordersData = await ordersRes.json() as { orders: Order[] };
        if (!mountedRef.current) return;
        setChaos(await chaosRes.json());
        setDlq(dlqData.events);
        setRecentOrders(ordersData.orders.slice(0, 10));
        // Fast while orders are in-flight or DLQ is growing, slow when idle
        const active = ordersData.orders.some(
          (o) => !["CONFIRMED", "COMPENSATED", "DEAD_LETTERED"].includes(o.status)
        );
        poll(active || dlqData.events.some((d) => !d.resolvedAt) ? 1500 : 8000);
      } catch {
        poll(5000);
      }
    }, delayMs);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    poll(0);
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [poll]);

  const applyPreset = async (preset: Partial<ChaosConfig>) => {
    const next = { ...chaos, ...preset };
    setChaos(next);
    await fetch("/api/chaos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  };

  const saveChaos = async () => {
    setSaving(true);
    await fetch("/api/chaos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chaos),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const resetChaos = async () => {
    const reset: ChaosConfig = {
      paymentFailureRate: 0,
      inventoryFailureRate: 0,
      processingDelayMs: 0,
      duplicateEventRate: 0,
      consumerTimeoutRate: 0,
      poisonMessageEnabled: false,
    };
    setChaos(reset);
    await fetch("/api/chaos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reset),
    });
  };

  // Fire a single test order with current chaos active
  const fireTestOrder = async () => {
    setFiring(true);
    setFireResult(null);
    try {
      const item = SAMPLE_ITEMS[Math.floor(Math.random() * SAMPLE_ITEMS.length)];
      const names = ["Sam Rivera", "Alex Chen", "Jordan Park", "Taylor Kim", "Morgan Lee"];
      const name = names[Math.floor(Math.random() * names.length)];
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name,
          customerEmail: `${name.toLowerCase().replace(" ", ".")}@lab.test`,
          customerId: `lab-${Date.now()}`,
          items: [{ ...item, quantity: 1 }],
          notes: `Failure Lab test — chaos: pay=${(chaos.paymentFailureRate * 100).toFixed(0)}% inv=${(chaos.inventoryFailureRate * 100).toFixed(0)}% delay=${chaos.processingDelayMs}ms`,
        }),
      });
      const data = await res.json();
      setFireResult({ orderId: data.orderId, status: data.status });
    } finally {
      setFiring(false);
    }
  };

  const retryDLQ = async (id: string) => {
    setRetrying(id);
    try {
      await fetch(`/api/dlq/${id}/retry`, { method: "POST" });
      poll(0);
    } finally {
      setRetrying(null);
    }
  };

  const activeFaults = [
    chaos.paymentFailureRate > 0,
    chaos.inventoryFailureRate > 0,
    chaos.processingDelayMs > 0,
    chaos.consumerTimeoutRate > 0,
    chaos.poisonMessageEnabled,
  ].filter(Boolean).length;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Zap className="h-6 w-6 text-yellow-400" />
            Failure Lab
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Inject faults, fire test orders, and observe saga compensation and DLQ in real-time
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeFaults > 0 && (
            <Badge variant="warning">{activeFaults} active fault{activeFaults !== 1 ? "s" : ""}</Badge>
          )}
          <Button
            variant="primary"
            size="md"
            loading={firing}
            onClick={fireTestOrder}
          >
            <FlaskConical className="h-4 w-4" />
            Fire Test Order
          </Button>
        </div>
      </div>

      {/* Fire result banner */}
      {fireResult && (
        <div className="flex items-center gap-3 rounded-lg border border-indigo-800/50 bg-indigo-950/30 px-4 py-3 text-sm">
          <span className="text-indigo-300">
            {fireResult.status === "DUPLICATE" ? "Duplicate rejected —" : "Order accepted —"}
          </span>
          <span className="font-mono text-indigo-400">{fireResult.orderId.slice(0, 8)}…</span>
          <span className="text-zinc-500">Watch it process below ↓</span>
        </div>
      )}

      {/* How faults route */}
      <div className="rounded-xl border border-zinc-800/40 bg-zinc-900/30 px-5 py-3">
        <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wider">How faults route</p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-orange-400 font-medium">Payment / Inventory failure</span>
          <ArrowRight className="h-3 w-3 text-zinc-600" />
          <span className="text-yellow-400">CompensationStarted</span>
          <ArrowRight className="h-3 w-3 text-zinc-600" />
          <span className="text-zinc-400">OrderCompensated</span>
          <span className="text-zinc-700 mx-2">|</span>
          <span className="text-red-400 font-medium">Poison message / Timeout</span>
          <ArrowRight className="h-3 w-3 text-zinc-600" />
          <span className="text-zinc-400">retry ×3</span>
          <ArrowRight className="h-3 w-3 text-zinc-600" />
          <span className="text-red-500 font-medium">DLQ</span>
        </div>
      </div>

      {/* Presets */}
      <Card>
        <CardHeader>
          <CardTitle>Scenario Presets</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Payment Chaos",    preset: { paymentFailureRate: 0.9 },                                                       icon: CreditCard, color: "text-red-400" },
            { label: "Inventory Drain",  preset: { inventoryFailureRate: 0.9 },                                                     icon: Package,    color: "text-orange-400" },
            { label: "Slow Consumers",   preset: { processingDelayMs: 3000 },                                                       icon: Timer,      color: "text-yellow-400" },
            { label: "Gateway Timeout",  preset: { consumerTimeoutRate: 0.7 },                                                      icon: Timer,      color: "text-amber-400" },
            { label: "Poison Message",   preset: { poisonMessageEnabled: true },                                                    icon: Skull,      color: "text-red-500" },
            { label: "Cascade Failure",  preset: { paymentFailureRate: 0.8, inventoryFailureRate: 0.6, processingDelayMs: 1500 },   icon: Zap,        color: "text-red-400" },
          ].map((s) => (
            <button
              key={s.label}
              onClick={() => applyPreset(s.preset)}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700/50 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 transition-all"
            >
              <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
              {s.label}
            </button>
          ))}
          <button
            onClick={resetChaos}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700/50 bg-zinc-900 px-3 py-2 text-xs font-medium text-green-400 hover:border-green-800 hover:bg-green-950/20 transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reset All
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: sliders */}
        <Card>
          <CardHeader>
            <CardTitle>Fault Injection Controls</CardTitle>
          </CardHeader>
          <div className="space-y-5">
            <FaultSlider
              label="Payment Failure Rate"
              description="→ PaymentFailed → Compensation saga"
              icon={<CreditCard className="h-4 w-4 text-red-400" />}
              value={chaos.paymentFailureRate}
              onChange={(v) => setChaos({ ...chaos, paymentFailureRate: v })}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              danger={chaos.paymentFailureRate > 0.5}
            />
            <FaultSlider
              label="Inventory Failure Rate"
              description="→ InventoryReservationFailed → Compensation saga"
              icon={<Package className="h-4 w-4 text-orange-400" />}
              value={chaos.inventoryFailureRate}
              onChange={(v) => setChaos({ ...chaos, inventoryFailureRate: v })}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              danger={chaos.inventoryFailureRate > 0.5}
            />
            <FaultSlider
              label="Consumer Timeout Rate"
              description="→ handler throws → retry ×3 → DLQ"
              icon={<Timer className="h-4 w-4 text-amber-400" />}
              value={chaos.consumerTimeoutRate}
              onChange={(v) => setChaos({ ...chaos, consumerTimeoutRate: v })}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              danger={chaos.consumerTimeoutRate > 0.4}
            />
            <FaultSlider
              label="Processing Delay"
              description="→ added to each event's scheduledFor timestamp"
              icon={<Timer className="h-4 w-4 text-yellow-400" />}
              value={chaos.processingDelayMs}
              max={5000}
              step={100}
              onChange={(v) => setChaos({ ...chaos, processingDelayMs: v })}
              format={(v) => `${v}ms`}
              danger={chaos.processingDelayMs > 2000}
            />

            {/* Poison toggle */}
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <Skull className="h-4 w-4 text-red-500" />
                <div>
                  <p className="text-sm text-zinc-300">Poison Message</p>
                  <p className="text-xs text-zinc-500">Validation handler always throws → DLQ</p>
                </div>
              </div>
              <button
                onClick={() =>
                  setChaos({ ...chaos, poisonMessageEnabled: !chaos.poisonMessageEnabled })
                }
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  chaos.poisonMessageEnabled ? "bg-red-600" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    chaos.poisonMessageEnabled ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            <div className="flex gap-2 pt-2 border-t border-zinc-800">
              <Button variant="secondary" size="sm" onClick={resetChaos}>
                <RefreshCw className="h-3 w-3" />
                Reset
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={saving}
                onClick={saveChaos}
                className={saved ? "!bg-green-700" : ""}
              >
                {saved ? "Applied ✓" : "Apply Changes"}
              </Button>
            </div>
          </div>
        </Card>

        {/* Right: live config + legend */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Configuration (live)</CardTitle>
            </CardHeader>
            <div className="font-mono text-xs space-y-2">
              {[
                { k: "paymentFailureRate",   v: `${(chaos.paymentFailureRate * 100).toFixed(0)}%`,   active: chaos.paymentFailureRate > 0,   routes: "→ Compensation" },
                { k: "inventoryFailureRate", v: `${(chaos.inventoryFailureRate * 100).toFixed(0)}%`, active: chaos.inventoryFailureRate > 0, routes: "→ Compensation" },
                { k: "processingDelayMs",    v: `${chaos.processingDelayMs}ms`,                      active: chaos.processingDelayMs > 0,    routes: "→ Slow pipeline" },
                { k: "consumerTimeoutRate",  v: `${(chaos.consumerTimeoutRate * 100).toFixed(0)}%`,  active: chaos.consumerTimeoutRate > 0,  routes: "→ DLQ after retries" },
                { k: "poisonMessageEnabled", v: String(chaos.poisonMessageEnabled),                  active: chaos.poisonMessageEnabled,     routes: "→ Always DLQ" },
              ].map(({ k, v, active, routes }) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <span className="text-zinc-600">{k}</span>
                  <div className="flex items-center gap-2">
                    {active && <span className="text-zinc-600 text-[10px]">{routes}</span>}
                    <span className={active ? "text-red-400" : "text-zinc-500"}>{v}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What to Observe</CardTitle>
            </CardHeader>
            <ul className="space-y-2 text-xs text-zinc-400">
              {[
                { tip: "Payment/Inventory failures → CompensationStarted → COMPENSATED status in the order list below", tag: "Compensation" },
                { tip: "Consumer timeout or Poison message → 3 retries with backoff → EventDeadLettered → DLQ panel", tag: "DLQ" },
                { tip: "Delay slider slows all event scheduling — watch state transitions stretch out", tag: "Latency" },
                { tip: "Retry×N badge appears on events that needed more than one attempt", tag: "Retry" },
              ].map(({ tip, tag }) => (
                <li key={tag} className="flex items-start gap-2">
                  <span className="shrink-0 text-[9px] bg-zinc-800 rounded px-1.5 py-0.5 text-zinc-500 font-medium mt-0.5">{tag}</span>
                  {tip}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {/* Live Orders */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
            Recent Orders
            <span className="ml-2 text-[10px] text-zinc-600 normal-case font-normal">live · 1.5s poll</span>
          </h2>
          <Button variant="ghost" size="sm" onClick={fireTestOrder} loading={firing}>
            <FlaskConical className="h-3.5 w-3.5" />
            Fire Test Order
          </Button>
        </div>

        {recentOrders.length === 0 ? (
          <div className="py-10 text-center text-zinc-600">
            <FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">No orders yet</p>
            <p className="text-xs mt-1">Set fault rates above, then click "Fire Test Order"</p>
          </div>
        ) : (
          <div className="space-y-1">
            {recentOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center gap-4 rounded-lg px-3 py-2.5 hover:bg-zinc-800/30 transition-colors"
              >
                <span className="font-mono text-xs text-zinc-600 w-20 shrink-0">
                  {order.id.slice(0, 8)}…
                </span>
                <span className="text-sm text-zinc-300 w-36 shrink-0">{order.customerName}</span>
                <StatusBadge
                  status={order.status}
                  pulse={["CREATED", "VALIDATED", "INVENTORY_RESERVED", "PAYMENT_PROCESSED", "COMPENSATION_STARTED"].includes(order.status)}
                />
                <span className="ml-auto font-mono text-xs text-zinc-500">
                  {formatCurrency(order.totalAmount)}
                </span>
                {order.notes && (
                  <span className="text-xs text-zinc-600 hidden lg:block max-w-xs truncate">
                    {order.notes}
                  </span>
                )}
                <span className="text-xs text-zinc-600 shrink-0">
                  {formatRelative(order.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* DLQ Panel */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
            Dead Letter Queue
            <Badge
              variant={dlq.filter((d) => !d.resolvedAt).length > 0 ? "danger" : "muted"}
              className="ml-2"
            >
              {dlq.filter((d) => !d.resolvedAt).length} pending
            </Badge>
          </h2>
        </div>

        {dlq.length === 0 ? (
          <div className="py-8 text-center text-zinc-600">
            <Skull className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">DLQ is empty</p>
            <p className="text-xs mt-1">
              Enable <span className="text-red-400">Poison Message</span> or <span className="text-amber-400">Consumer Timeout</span>, then fire a test order
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {dlq.map((event) => (
              <div
                key={event.id}
                className={`flex items-start gap-4 rounded-lg border p-4 ${
                  event.resolvedAt
                    ? "border-zinc-800/30 bg-zinc-900/20"
                    : "border-red-900/40 bg-red-950/15"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-medium text-red-300">
                      {event.eventType}
                    </span>
                    <Badge variant="muted">retry ×{event.retryCount}</Badge>
                    {event.resolvedAt && <Badge variant="success">Resolved</Badge>}
                  </div>
                  <p className="text-xs text-zinc-500 font-mono">
                    {event.aggregateId.slice(0, 8)}… · corr:{event.correlationId.slice(0, 8)}…
                  </p>
                  <p className="text-xs text-red-400 mt-1 font-mono">{event.failureReason}</p>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    {formatRelative(event.deadLetteredAt)}
                    {event.resolvedBy && ` · resolved by ${event.resolvedBy}`}
                  </p>
                </div>
                {!event.resolvedAt && (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={retrying === event.id}
                    onClick={() => retryDLQ(event.id)}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Slider ───────────────────────────────────────────────────────────────────

interface FaultSliderProps {
  label: string;
  description: string;
  icon: React.ReactNode;
  value: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  danger?: boolean;
}

function FaultSlider({
  label,
  description,
  icon,
  value,
  max = 1,
  step = 0.01,
  onChange,
  format,
  danger,
}: FaultSliderProps) {
  return (
    <div>
      <div className="flex items-start justify-between mb-1.5 gap-2">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <span className="text-sm text-zinc-300">{label}</span>
            <p className="text-[11px] text-zinc-600">{description}</p>
          </div>
        </div>
        <span
          className={`text-sm font-mono font-semibold shrink-0 ${
            danger ? "text-red-400" : value > 0 ? "text-yellow-400" : "text-zinc-500"
          }`}
        >
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
        style={{ accentColor: danger ? "#ef4444" : value > 0 ? "#facc15" : "#6366f1" }}
      />
      <div className="flex justify-between text-[10px] text-zinc-700 mt-0.5">
        <span>0</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}
