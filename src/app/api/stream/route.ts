/**
 * Server-Sent Events stream — replaces GET /api/metrics polling on the dashboard.
 *
 * The server pushes a metrics snapshot every 600ms (while active) or 5s (idle).
 * EventSource on the client auto-reconnects if the stream drops.
 *
 * In production this would use Vercel Edge Runtime for persistent connections.
 * In serverless mode the function times out (~30s) and the client reconnects
 * transparently — this is standard SSE behaviour and requires no client changes.
 */

import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { processNextBatch } from "@/lib/event-bus";
import "@/domain/handlers";
import type { OrderStatus, ConsumerHealth, ConsumerLagStat } from "@/lib/types";

export const dynamic = "force-dynamic";

// Reuse the same metrics-building logic as GET /api/metrics
function buildMetrics() {
  const stats      = store.getStats();
  const allOrders  = store.getAllOrders();
  const allEvents  = store.getAllEvents();
  const throughput = store.getThroughput();

  const ordersByStatus = {} as Record<OrderStatus, number>;
  for (const order of allOrders) {
    ordersByStatus[order.status] = (ordersByStatus[order.status] ?? 0) + 1;
  }

  const latencyMap = new Map<string, number[]>();
  for (const ev of allEvents) {
    if (ev.processingLatencyMs !== null && ev.status === "PROCESSED") {
      const arr = latencyMap.get(ev.type) ?? [];
      arr.push(ev.processingLatencyMs);
      latencyMap.set(ev.type, arr);
    }
  }

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

  // Consumer health
  const execLogs = store.getAllExecutionLogs();
  const cMap = new Map<string, { total: number; success: number; failures: number; latencies: number[]; lastError: string | null }>();
  for (const log of execLogs) {
    if (!cMap.has(log.consumer)) cMap.set(log.consumer, { total: 0, success: 0, failures: 0, latencies: [], lastError: null });
    const s = cMap.get(log.consumer)!;
    s.total++;
    if (log.status === "SUCCESS") { s.success++; if (log.latencyMs !== null) s.latencies.push(log.latencyMs); }
    else if (log.status === "FAILED") { s.failures++; if (log.error) s.lastError = log.error; }
  }
  const consumerHealth: ConsumerHealth[] = Array.from(cMap.entries()).map(([consumer, s]) => ({
    consumer,
    totalProcessed: s.total,
    successCount: s.success,
    failureCount: s.failures,
    avgLatencyMs: s.latencies.length > 0 ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length) : 0,
    lastError: s.lastError,
  }));

  const consumerLag: ConsumerLagStat[] = store.getLagStats();
  const latencyPercentiles = store.getLatencyPercentiles();

  return {
    ...stats,
    throughputPerMinute: filledThroughput[filledThroughput.length - 1]?.count ?? 0,
    ordersByStatus,
    recentEvents,
    eventThroughput: filledThroughput,
    latencyByType: Array.from(latencyMap.entries()).map(([type, vals]) => ({
      type,
      avgMs: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
    })),
    consumerHealth,
    consumerLag,
    latencyPercentiles,
  };
}

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller may be closed if client disconnected
        }
      };

      // Send initial snapshot immediately
      await processNextBatch(10);
      enqueue(buildMetrics());

      // Push updates on an adaptive interval
      let idleTicks = 0;

      const tick = async () => {
        await processNextBatch(10);
        const metrics = buildMetrics();
        enqueue(metrics);

        const hasPending = metrics.pendingEvents > 0;
        if (hasPending) {
          idleTicks = 0;
        } else {
          idleTicks++;
        }

        // Active: 600ms, settling: 2s, idle: 6s
        const delay = hasPending ? 600 : idleTicks < 5 ? 2000 : 6000;
        await new Promise((r) => setTimeout(r, delay));
        tick(); // intentionally not awaited — runs in background
      };

      tick();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no", // disable Nginx buffering
    },
  });
}
