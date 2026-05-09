"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, ChevronRight, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Order } from "@/lib/types";
import { CreateOrderModal } from "./create-order-modal";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "All Statuses" },
  { value: "CREATED", label: "Created" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "PAYMENT_FAILED", label: "Payment Failed" },
  { value: "INVENTORY_FAILED", label: "Inventory Failed" },
  { value: "COMPENSATED", label: "Compensated" },
  { value: "DEAD_LETTERED", label: "Dead Letter" },
];

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const poll = useCallback((delayMs: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      try {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (statusFilter !== "ALL") params.set("status", statusFilter);
        const res  = await fetch(`/api/orders?${params}`);
        if (!res.ok) { poll(5000); return; }
        const data = await res.json() as { orders: Order[] };
        if (!mountedRef.current) return;
        const list = data.orders ?? [];
        setOrders(list);
        setLoading(false);
        const inFlight = list.some(
          (o) => !["CONFIRMED", "COMPENSATED", "DEAD_LETTERED"].includes(o.status)
        );
        poll(inFlight ? 1200 : 8000);
      } catch {
        poll(5000);
      }
    }, delayMs);
  }, [search, statusFilter]);

  useEffect(() => {
    mountedRef.current = true;
    poll(0);
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [poll]);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Orders</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {orders.length} order{orders.length !== 1 ? "s" : ""} — live polling every 2s
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          New Order
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by name, email, or order ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-4 text-sm text-zinc-200 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Orders Table */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-zinc-600">
            <div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-3" />
            Loading orders…
          </div>
        ) : orders.length === 0 ? (
          <div className="py-20 text-center text-zinc-600">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No orders found</p>
            <p className="text-xs mt-1">Run the interview demo or create an order</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800/60">
                <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Order</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Customer</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Amount</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Created</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Items</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {orders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => router.push(`/orders/${order.id}`)}
                  className="hover:bg-zinc-800/30 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-xs text-zinc-400">
                      {order.id.slice(0, 8)}…
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-zinc-200">{order.customerName}</p>
                    <p className="text-xs text-zinc-500">{order.customerEmail}</p>
                    {order.notes && (
                      <p className="text-[10px] text-zinc-600 font-mono mt-0.5 truncate max-w-[200px]">
                        {order.notes}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge
                      status={order.status}
                      pulse={
                        order.status === "CREATED" ||
                        order.status === "VALIDATED" ||
                        order.status === "INVENTORY_RESERVED"
                      }
                    />
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="font-mono text-sm font-medium text-zinc-200">
                      {formatCurrency(order.totalAmount)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-zinc-500">
                      {formatDate(order.createdAt)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-zinc-500">{order.items.length} item{order.items.length !== 1 ? "s" : ""}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <ChevronRight className="h-4 w-4 text-zinc-600" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {showCreate && (
        <CreateOrderModal
          onClose={() => setShowCreate(false)}
          onCreated={() => poll(0)}
        />
      )}
    </div>
  );
}
