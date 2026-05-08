import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { processNextBatch } from "@/lib/event-bus";
import "@/domain/handlers";
import type { DashboardMetrics, OrderStatus } from "@/lib/types";

export async function GET() {
  // Process any pending events before building the response.
  // The dashboard polls this endpoint every 1.5s — that's sufficient to drive
  // the async pipeline without a dedicated polling route.
  await processNextBatch(10);

  const stats = store.getStats();
  const allOrders = store.getAllOrders();
  const allEvents = store.getAllEvents();
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

  // Throughput: ensure at least the last 10 minutes appear in the chart
  const now = new Date();
  const filledThroughput = [];
  for (let i = 9; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 60_000);
    const minute = d.toISOString().slice(0, 16);
    const existing = throughput.find((p) => p.minute === minute);
    filledThroughput.push({ minute, count: existing?.count ?? 0 });
  }

  const recentEvents = allEvents
    .filter((e) => e.status === "PROCESSED" || e.status === "FAILED")
    .slice(-20)
    .reverse();

  const metrics: DashboardMetrics = {
    ...stats,
    throughputPerMinute:
      filledThroughput[filledThroughput.length - 1]?.count ?? 0,
    ordersByStatus,
    recentEvents,
    eventThroughput: filledThroughput,
    latencyByType,
  };

  return NextResponse.json(metrics);
}
