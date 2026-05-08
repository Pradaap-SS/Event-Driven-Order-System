"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ArrowRight, RotateCcw } from "lucide-react";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  formatCurrency,
  formatDate,
  formatRelative,
  EVENT_CONFIG,
  cn,
} from "@/lib/utils";
import type {
  Order,
  DomainEvent,
  ProjectionOrderView,
  DeadLetterEvent,
  ConsumerExecutionLog,
} from "@/lib/types";

interface OrderDetailData {
  order: Order;
  events: DomainEvent[];
  projection: ProjectionOrderView | null;
  dlqEvents: DeadLetterEvent[];
  executionLogs: ConsumerExecutionLog[];
}

export default function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [data, setData] = useState<OrderDetailData | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const poll = useCallback((delayMs: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      try {
        const res = await fetch(`/api/orders/${params.id}`);
        if (!res.ok) { poll(3000); return; }
        const next = await res.json() as OrderDetailData;
        if (!mountedRef.current) return;
        setData(next);
        const settled = ["CONFIRMED", "COMPENSATED", "DEAD_LETTERED"].includes(
          next.order.status
        );
        poll(settled ? 10000 : 1000);
      } catch {
        poll(5000);
      }
    }, delayMs);
  }, [params.id]);

  useEffect(() => {
    mountedRef.current = true;
    poll(0);
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [poll]);

  const retryDLQ = async (dlqId: string) => {
    setRetrying(dlqId);
    try {
      await fetch(`/api/dlq/${dlqId}/retry`, { method: "POST" });
      poll(0);
    } finally {
      setRetrying(null);
    }
  };

  if (!data) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const { order, events, projection, dlqEvents } = data;

  return (
    <div className="p-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/orders" className="hover:text-zinc-300 flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" />
          Orders
        </Link>
        <span>/</span>
        <span className="font-mono text-zinc-400">{order.id.slice(0, 8)}…</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{order.customerName}</h1>
          <p className="text-sm text-zinc-500 mt-1">{order.customerEmail}</p>
        </div>
        <StatusBadge status={order.status} pulse={
          order.status === "CREATED" || order.status === "VALIDATED" ||
          order.status === "INVENTORY_RESERVED" || order.status === "PAYMENT_PROCESSED"
        } />
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Order ID" value={order.id.slice(0, 8) + "…"} mono />
        <StatCard label="Correlation ID" value={order.correlationId.slice(0, 8) + "…"} mono />
        <StatCard label="Total Amount" value={formatCurrency(order.totalAmount)} />
        <StatCard label="Created" value={formatRelative(order.createdAt)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Event Timeline — main column */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800/60">
              <h2 className="text-sm font-medium text-zinc-300">
                Event Timeline
                <Badge variant="muted" className="ml-2">{events.length}</Badge>
              </h2>
            </div>
            <div className="divide-y divide-zinc-800/30">
              {events.length === 0 ? (
                <div className="py-10 text-center text-zinc-600 text-sm">
                  No events yet — processing…
                </div>
              ) : (
                events.map((event, idx) => {
                  const cfg = EVENT_CONFIG[event.type];
                  const isLast = idx === events.length - 1;
                  return (
                    <div key={event.id} className="flex gap-4 px-5 py-4 hover:bg-zinc-800/20 transition-colors">
                      {/* Timeline connector */}
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            "h-2.5 w-2.5 rounded-full border-2 mt-0.5 shrink-0",
                            event.status === "PROCESSED"
                              ? "border-green-500 bg-green-500/30"
                              : event.status === "FAILED" || event.status === "DEAD_LETTERED"
                              ? "border-red-500 bg-red-500/30"
                              : event.status === "PROCESSING"
                              ? "border-yellow-500 bg-yellow-500/30 animate-pulse"
                              : "border-zinc-600 bg-zinc-700"
                          )}
                        />
                        {!isLast && <div className="w-px flex-1 bg-zinc-800 mt-1" />}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pb-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn("text-sm font-medium font-mono", cfg?.color)}>
                            {event.type}
                          </span>
                          {event.retryCount > 0 && (
                            <Badge variant="warning">retry ×{event.retryCount}</Badge>
                          )}
                          {event.status === "DEAD_LETTERED" && (
                            <Badge variant="danger">DLQ</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-zinc-500">
                          <span>{cfg?.producer}</span>
                          {event.consumer && (
                            <>
                              <ArrowRight className="h-3 w-3" />
                              <span>{event.consumer}</span>
                            </>
                          )}
                          {event.processingLatencyMs !== null && (
                            <span className="text-zinc-600 font-mono">
                              {event.processingLatencyMs}ms
                            </span>
                          )}
                          <span className="ml-auto">{formatDate(event.timestamp)}</span>
                        </div>
                        {event.processingError && (
                          <p className="mt-1 text-xs text-red-400 font-mono bg-red-950/30 rounded px-2 py-1">
                            {event.processingError}
                          </p>
                        )}
                        {/* Payload preview */}
                        <details className="mt-2">
                          <summary className="text-xs text-zinc-600 cursor-pointer hover:text-zinc-400">
                            payload
                          </summary>
                          <pre className="mt-1 text-xs text-zinc-500 font-mono bg-zinc-900 rounded p-2 overflow-auto max-h-24">
                            {JSON.stringify(event.payload, null, 2)}
                          </pre>
                        </details>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* DLQ Events */}
          {dlqEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-red-400">Dead Letter Queue</CardTitle>
              </CardHeader>
              <div className="space-y-3">
                {dlqEvents.map((dlq) => (
                  <div
                    key={dlq.id}
                    className="rounded-lg border border-red-900/40 bg-red-950/20 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-red-300 font-mono">{dlq.eventType}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {dlq.retryCount} retries · dead-lettered {formatRelative(dlq.deadLetteredAt)}
                        </p>
                        <p className="text-xs text-red-400 mt-1 font-mono">{dlq.failureReason}</p>
                      </div>
                      {!dlq.resolvedAt && (
                        <Button
                          variant="outline"
                          size="sm"
                          loading={retrying === dlq.id}
                          onClick={() => retryDLQ(dlq.id)}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Retry
                        </Button>
                      )}
                      {dlq.resolvedAt && (
                        <Badge variant="success">Resolved</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Read Model Projection */}
          <Card>
            <CardHeader>
              <CardTitle>Read Model Projection</CardTitle>
            </CardHeader>
            {projection ? (
              <div className="space-y-3 text-sm">
                <Row label="Status" value={<StatusBadge status={projection.status} />} />
                <Row label="Events" value={<span className="font-mono text-zinc-300">{projection.eventCount}</span>} />
                <Row label="Retries" value={<span className="font-mono text-zinc-300">{projection.retryCount}</span>} />
                <Row label="In DLQ" value={
                  <Badge variant={projection.isInDLQ ? "danger" : "muted"}>
                    {projection.isInDLQ ? "Yes" : "No"}
                  </Badge>
                } />
                {projection.processingTimeMs && (
                  <Row
                    label="Processing Time"
                    value={<span className="font-mono text-zinc-300">{projection.processingTimeMs}ms</span>}
                  />
                )}
                {projection.lastEventType && (
                  <Row
                    label="Last Event"
                    value={
                      <span className={`font-mono text-xs ${EVENT_CONFIG[projection.lastEventType]?.color}`}>
                        {projection.lastEventType}
                      </span>
                    }
                  />
                )}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">Projection not yet built</p>
            )}
          </Card>

          {/* Order Items */}
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <div className="space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-zinc-300">{item.name}</p>
                    <p className="text-xs text-zinc-500 font-mono">{item.sku} × {item.quantity}</p>
                  </div>
                  <span className="font-mono text-zinc-400">
                    {formatCurrency(item.quantity * item.unitPrice)}
                  </span>
                </div>
              ))}
              <div className="border-t border-zinc-800 pt-2 flex justify-between font-medium">
                <span className="text-zinc-400">Total</span>
                <span className="font-mono text-zinc-200">{formatCurrency(order.totalAmount)}</span>
              </div>
            </div>
          </Card>

          {/* Correlation Trace */}
          <Card>
            <CardHeader>
              <CardTitle>Correlation Trace</CardTitle>
            </CardHeader>
            <div className="space-y-1.5 text-xs font-mono">
              <div>
                <span className="text-zinc-600">correlationId</span>
                <p className="text-zinc-400 break-all">{order.correlationId}</p>
              </div>
              <div>
                <span className="text-zinc-600">idempotencyKey</span>
                <p className="text-zinc-400 break-all">{order.idempotencyKey}</p>
              </div>
              <div>
                <span className="text-zinc-600">causation chain</span>
                <div className="mt-1 space-y-0.5">
                  {events.slice(0, 6).map((e) => (
                    <div key={e.id} className="flex items-center gap-1.5">
                      <div className="h-1 w-1 rounded-full bg-indigo-500" />
                      <span className="text-zinc-500">{e.type}</span>
                    </div>
                  ))}
                  {events.length > 6 && (
                    <div className="text-zinc-600">+{events.length - 6} more</div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/60 p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className={cn("text-sm font-medium text-zinc-200", mono && "font-mono")}>{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}
