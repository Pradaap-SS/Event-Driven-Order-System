import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { processNextBatch } from "@/lib/event-bus";
import "@/domain/handlers";
import type { DashboardMetrics, OrderStatus, ConsumerHealth, ConsumerLagStat } from "@/lib/types";

export async function GET() {
  await processNextBatch(10);

  const stats      = store.getStats();
  const allOrders  = store.getAllOrders();
  const allEvents  = store.getAllEvents();
  const throughput = store.getThroughput();

  // Orders by status
  const ordersByStatus = {} as Record<OrderStatus, number>;
  for (const order of allOrders) {
    ordersByStatus[order.status] = (ordersByStatus[order.status] ?? 0) + 1;
  }

  // Avg latency by event type
  const latencyMap = new Map<string, number[]>();
  for (const ev of allEvents) {
    if (ev.processingLatencyMs !== null && ev.status === "PROCESSED") {
      const arr = latencyMap.get(ev.type) ?? [];
      arr.push(ev.processingLatencyMs);
      latencyMap.set(ev.type, arr);
    }
  }
  const latencyByType = Array.from(latencyMap.entries()).map(([type, vals]) => ({
    type,
    avgMs: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
  }));

  // Filled throughput chart (last 10 minutes)
  const now = new Date();
  const filledThroughput = [];
  for (let i = 9; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 60_000);
    const minute = d.toISOString().slice(0, 16);
    const existing = throughput.find((p) => p.minute === minute);
    filledThroughput.push({ minute, count: existing?.count ?? 0 });
  }

  const recentEvents = allEvents
    .filter((e) => e.status === "PROCESSED" || e.status === "FAILED" || e.status === "DEAD_LETTERED")
    .slice(-25)
    .reverse();

  // Consumer health — aggregate execution logs per consumer
  const execLogs = store.getAllExecutionLogs();
  const consumerMap = new Map<string, {
    total: number; success: number; failures: number;
    latencies: number[]; lastError: string | null;
  }>();

  for (const log of execLogs) {
    if (!consumerMap.has(log.consumer)) {
      consumerMap.set(log.consumer, { total: 0, success: 0, failures: 0, latencies: [], lastError: null });
    }
    const s = consumerMap.get(log.consumer)!;
    s.total++;
    if (log.status === "SUCCESS") {
      s.success++;
      if (log.latencyMs !== null) s.latencies.push(log.latencyMs);
    } else if (log.status === "FAILED") {
      s.failures++;
      if (log.error) s.lastError = log.error;
    }
  }

  const CONSUMER_ORDER = [
    "validation-service", "inventory-service", "payment-service",
    "order-service", "notification-service", "compensation-service",
    "retry-scheduler", "dlq-processor",
  ];

  const consumerHealth: ConsumerHealth[] = Array.from(consumerMap.entries())
    .sort(([a], [b]) => {
      const ai = CONSUMER_ORDER.indexOf(a);
      const bi = CONSUMER_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .map(([consumer, s]) => ({
      consumer,
      totalProcessed: s.total,
      successCount:   s.success,
      failureCount:   s.failures,
      avgLatencyMs:   s.latencies.length > 0
        ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length)
        : 0,
      lastError: s.lastError,
    }));

  const consumerLag: ConsumerLagStat[] = store.getLagStats()
    .sort((a, b) => b.avgLagMs - a.avgLagMs);

  const latencyPercentiles = store.getLatencyPercentiles();

  const metrics: DashboardMetrics = {
    ...stats,
    throughputPerMinute: filledThroughput[filledThroughput.length - 1]?.count ?? 0,
    ordersByStatus,
    recentEvents,
    eventThroughput: filledThroughput,
    latencyByType,
    consumerHealth,
    consumerLag,
    latencyPercentiles,
  };

  return NextResponse.json(metrics);
}
