"use client";

import { useEffect, useState, useCallback } from "react";
import type { WaterfallSpan } from "@/lib/tracer";

interface TraceWaterfallProps {
  orderId: string;
}

const STATUS_COLOR: Record<string, string> = {
  OK:    "bg-green-500",
  ERROR: "bg-red-500",
  UNSET: "bg-zinc-500",
};

const SERVICE_COLOR: Record<string, string> = {
  "validation-service":   "bg-blue-600/80",
  "inventory-service":    "bg-teal-600/80",
  "payment-service":      "bg-violet-600/80",
  "order-service":        "bg-indigo-600/80",
  "notification-service": "bg-cyan-600/80",
  "compensation-service": "bg-orange-600/80",
  "retry-scheduler":      "bg-amber-600/80",
  "dlq-processor":        "bg-red-700/80",
};

function serviceColor(service: string) {
  return SERVICE_COLOR[service] ?? "bg-zinc-600/80";
}

export function TraceWaterfall({ orderId }: TraceWaterfallProps) {
  const [spans, setSpans]         = useState<WaterfallSpan[]>([]);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);

  const fetchTraces = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}/traces`);
      if (!res.ok) return;
      const data = await res.json() as { correlationId: string; spans: WaterfallSpan[] };
      setSpans(data.spans);
      setCorrelationId(data.correlationId);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchTraces();
    const iv = setInterval(fetchTraces, 2000);
    return () => clearInterval(iv);
  }, [fetchTraces]);

  if (loading) {
    return (
      <div className="py-8 text-center text-zinc-600 text-sm">
        Loading traces…
      </div>
    );
  }

  if (spans.length === 0) {
    return (
      <div className="py-8 text-center text-zinc-600 text-sm">
        No spans yet — events haven't been processed
      </div>
    );
  }

  const totalMs = Math.max(...spans.map((s) => s.relativeEnd));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 text-xs text-zinc-500 font-mono">
        <span>trace: {correlationId?.slice(0, 16)}…</span>
        <span>{spans.length} spans · {totalMs}ms total</span>
      </div>

      {/* Timescale header */}
      <div className="flex mb-1 ml-48 text-[10px] text-zinc-600 font-mono">
        {[0, 25, 50, 75, 100].map((pct) => (
          <span key={pct} className="flex-1 text-center">
            {Math.round((totalMs * pct) / 100)}ms
          </span>
        ))}
      </div>

      {/* Spans */}
      <div className="space-y-1">
        {spans.map((span) => {
          const leftPct  = totalMs > 0 ? (span.offsetMs / totalMs) * 100 : 0;
          const widthPct = totalMs > 0 ? ((span.durationMs ?? 1) / totalMs) * 100 : 1;
          const minWidth = Math.max(widthPct, 0.5);

          return (
            <div key={span.spanId} className="flex items-center gap-2 group">
              {/* Span name */}
              <div
                className="w-48 shrink-0 text-right pr-2"
                style={{ paddingLeft: `${span.depth * 8}px` }}
              >
                <span className="text-[10px] font-mono text-zinc-400 truncate block">
                  {span.name.split("/")[1] ?? span.name}
                </span>
                <span className="text-[9px] text-zinc-600">{span.service}</span>
              </div>

              {/* Track */}
              <div className="flex-1 relative h-5 bg-zinc-900 rounded overflow-hidden">
                <div
                  className={`absolute h-full rounded ${serviceColor(span.service)} ${
                    span.status === "ERROR" ? "opacity-60" : "opacity-90"
                  } transition-all`}
                  style={{
                    left:  `${leftPct}%`,
                    width: `${minWidth}%`,
                  }}
                />
                {/* Error stripe */}
                {span.status === "ERROR" && (
                  <div
                    className="absolute h-full opacity-40"
                    style={{
                      left:       `${leftPct}%`,
                      width:      `${minWidth}%`,
                      background: "repeating-linear-gradient(45deg, #ef4444 0, #ef4444 2px, transparent 2px, transparent 6px)",
                    }}
                  />
                )}
              </div>

              {/* Duration + status */}
              <div className="w-16 shrink-0 text-right">
                <span className={`text-[10px] font-mono ${
                  span.status === "ERROR" ? "text-red-400" : "text-zinc-500"
                }`}>
                  {span.durationMs !== null ? `${span.durationMs}ms` : "…"}
                </span>
              </div>

              {/* Status dot */}
              <div className={`h-2 w-2 rounded-full shrink-0 ${STATUS_COLOR[span.status] ?? "bg-zinc-600"}`} />
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-zinc-800/60">
        {Object.entries(SERVICE_COLOR).map(([service, color]) => (
          <div key={service} className="flex items-center gap-1.5">
            <span className={`h-2 w-3 rounded-sm ${color}`} />
            <span className="text-[10px] text-zinc-600 font-mono">{service}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
