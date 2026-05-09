"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Shield, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EVENT_CONFIG, formatDate, formatRelative, cn } from "@/lib/utils";
import type { DomainEvent, EventType } from "@/lib/types";

const STATUS_PILL: Record<string, string> = {
  PROCESSED:    "bg-green-900/40 text-green-400",
  FAILED:       "bg-orange-900/40 text-orange-400",
  DEAD_LETTERED:"bg-red-900/40 text-red-400",
  PENDING:      "bg-zinc-800 text-zinc-400",
  PROCESSING:   "bg-yellow-900/40 text-yellow-400",
};

const EVENT_TYPES: EventType[] = [
  "OrderCreated","OrderValidated","OrderValidationFailed",
  "InventoryReserved","InventoryReservationFailed",
  "PaymentProcessed","PaymentFailed",
  "OrderConfirmed","CompensationStarted","OrderCompensated",
  "NotificationQueued","NotificationSent",
  "EventRetried","EventDeadLettered",
];

export default function AuditPage() {
  const [events, setEvents]     = useState<DomainEvent[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [pages, setPages]       = useState(1);
  const [search, setSearch]     = useState("");
  const [typeFilter, setType]   = useState("ALL");
  const [statusFilter, setStat] = useState("ALL");
  const [loading, setLoading]   = useState(true);

  const fetchEvents = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("search", search);
    if (typeFilter !== "ALL") params.set("type", typeFilter);
    if (statusFilter !== "ALL") params.set("status", statusFilter);

    const res = await fetch(`/api/events?${params}`);
    if (!res.ok) return;
    const data = await res.json() as { events: DomainEvent[]; total: number; page: number; pages: number };
    setEvents(data.events);
    setTotal(data.total);
    setPages(data.pages);
    setLoading(false);
  }, [page, search, typeFilter, statusFilter]);

  useEffect(() => {
    fetchEvents();
    const iv = setInterval(fetchEvents, 4000);
    return () => clearInterval(iv);
  }, [fetchEvents]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, typeFilter, statusFilter]);

  const processed    = events.filter((e) => e.status === "PROCESSED").length;
  const failed       = events.filter((e) => e.status === "FAILED" || e.status === "DEAD_LETTERED").length;
  const retried      = events.reduce((s, e) => s + e.retryCount, 0);

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-zinc-800 flex items-center justify-center">
          <Shield className="h-4 w-4 text-zinc-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Audit Log</h1>
          <p className="text-sm text-zinc-500">
            Immutable append-only record of every domain event · {total.toLocaleString()} total
          </p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total events",  value: total,     color: "text-zinc-200" },
          { label: "Processed",     value: total - failed, color: "text-green-400" },
          { label: "Failed / DLQ",  value: failed,    color: failed > 0 ? "text-red-400" : "text-zinc-500" },
          { label: "Total retries", value: retried,   color: retried > 0 ? "text-orange-400" : "text-zinc-500" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-zinc-800/60 bg-zinc-900/60 px-4 py-3">
            <p className={`text-xl font-bold font-mono ${color}`}>{value.toLocaleString()}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search type, producer, order ID, correlation ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-4 text-xs text-zinc-200 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <select value={typeFilter} onChange={(e) => setType(e.target.value)}
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 focus:outline-none">
          <option value="ALL">All types</option>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStat(e.target.value)}
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 focus:outline-none">
          <option value="ALL">All statuses</option>
          {["PROCESSED","FAILED","DEAD_LETTERED","PENDING","PROCESSING"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Event table */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-zinc-600">
            <div className="animate-spin h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-2" />
            Loading audit log…
          </div>
        ) : events.length === 0 ? (
          <div className="py-16 text-center text-zinc-600">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">No events match the current filters</p>
          </div>
        ) : (
          <>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800/60">
                  {["Timestamp","Event","Producer","Order","Status","Latency","Retries"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-zinc-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/30">
                {events.map((event) => {
                  const cfg = EVENT_CONFIG[event.type];
                  return (
                    <tr key={event.id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-zinc-500 whitespace-nowrap">
                        {formatDate(event.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("font-mono font-medium", cfg?.color ?? "text-zinc-400")}>
                          {event.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500">{event.producer}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/orders/${event.aggregateId}`}
                          className="font-mono text-indigo-400 hover:text-indigo-300"
                        >
                          {event.aggregateId.slice(0, 8)}…
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_PILL[event.status] ?? "bg-zinc-800 text-zinc-500")}>
                          {event.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-500">
                        {event.processingLatencyMs !== null ? `${event.processingLatencyMs}ms` : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {event.retryCount > 0
                          ? <span className="text-orange-400">×{event.retryCount}</span>
                          : <span className="text-zinc-700">0</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800/60">
                <span className="text-xs text-zinc-500">
                  Page {page} of {pages} · {total} total events
                </span>
                <div className="flex gap-1">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="h-7 w-7 rounded flex items-center justify-center text-zinc-500 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                    const pg = Math.max(1, Math.min(page - 2 + i, pages - 4 + i));
                    return (
                      <button key={pg} onClick={() => setPage(pg)}
                        className={cn("h-7 w-7 rounded text-xs font-mono", pg === page ? "bg-indigo-600 text-white" : "text-zinc-500 hover:bg-zinc-800")}>
                        {pg}
                      </button>
                    );
                  })}
                  <button
                    disabled={page === pages}
                    onClick={() => setPage((p) => p + 1)}
                    className="h-7 w-7 rounded flex items-center justify-center text-zinc-500 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Immutability note */}
      <p className="text-xs text-zinc-700 font-mono text-center">
        Events are append-only. No event is ever deleted or modified. This is the source of truth.
      </p>
    </div>
  );
}
