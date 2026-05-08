"use client";

import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { v4 as uuid } from "uuid";

interface Item {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

const SAMPLE_PRODUCTS = [
  { sku: "SKU-A100", name: "Wireless Headset Pro",    unitPrice: 149.99 },
  { sku: "SKU-B200", name: "Mechanical Keyboard v3",  unitPrice: 89.5 },
  { sku: "SKU-C300", name: "4K Webcam Ultra",         unitPrice: 199.0 },
  { sku: "SKU-D400", name: "USB-C Hub 7-in-1",        unitPrice: 59.99 },
  { sku: "SKU-E500", name: "Ergonomic Mouse Pad XL",  unitPrice: 29.95 },
  { sku: "SKU-F600", name: "Standing Desk Converter", unitPrice: 349.0 },
];

export function CreateOrderModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [customerName, setCustomerName] = useState("Alex Johnson");
  const [customerEmail, setCustomerEmail] = useState("alex@example.com");
  const [items, setItems] = useState<Item[]>([
    { ...SAMPLE_PRODUCTS[0], quantity: 1 },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string; orderId: string } | null>(null);

  const addItem = () => {
    setItems([...items, { ...SAMPLE_PRODUCTS[0], quantity: 1 }]);
  };

  const updateItem = (idx: number, field: keyof Item, value: string | number) => {
    setItems(items.map((item, i) => {
      if (i !== idx) return item;
      if (field === "sku") {
        const product = SAMPLE_PRODUCTS.find((p) => p.sku === value);
        return product ? { ...product, quantity: item.quantity } : { ...item, sku: String(value) };
      }
      return { ...item, [field]: value };
    }));
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  const submit = async () => {
    if (!customerName || items.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerEmail,
          customerId: uuid(),
          items,
          idempotencyKey: uuid(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult({ status: data.status, orderId: data.orderId });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl animate-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-zinc-100">Create Order</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          <div className="text-center py-8">
            <div className="h-12 w-12 rounded-full bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-zinc-100 mb-1">
              {result.status === "DUPLICATE" ? "Duplicate Detected" : "Order Accepted"}
            </p>
            <p className="text-sm text-zinc-400 mb-1">
              {result.status === "DUPLICATE"
                ? "Idempotency key matched — returning existing order"
                : "Processing asynchronously…"}
            </p>
            <p className="font-mono text-xs text-zinc-600">{result.orderId}</p>
            <Button className="mt-6" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            {/* Customer */}
            <div className="space-y-3 mb-5">
              <label className="block">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Customer Name</span>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Email</span>
                <input
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
                />
              </label>
            </div>

            {/* Items */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Items</span>
                <button
                  onClick={addItem}
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Add item
                </button>
              </div>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-2">
                    <select
                      value={item.sku}
                      onChange={(e) => updateItem(idx, "sku", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-zinc-200 focus:outline-none"
                    >
                      {SAMPLE_PRODUCTS.map((p) => (
                        <option key={p.sku} value={p.sku} className="bg-zinc-900">{p.name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                      className="w-12 bg-transparent text-center text-sm text-zinc-200 focus:outline-none"
                    />
                    <span className="text-xs text-zinc-500 w-16 text-right font-mono">
                      ${(item.unitPrice * item.quantity).toFixed(2)}
                    </span>
                    {items.length > 1 && (
                      <button onClick={() => removeItem(idx)} className="text-zinc-600 hover:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-zinc-800 pt-4 mb-4">
              <span className="text-sm text-zinc-400">Total</span>
              <span className="font-mono font-semibold text-zinc-100">
                ${totalAmount.toFixed(2)}
              </span>
            </div>

            {error && (
              <p className="text-xs text-red-400 mb-3">{error}</p>
            )}

            <div className="flex gap-3">
              <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
              <Button variant="primary" onClick={submit} loading={loading} className="flex-1">
                Submit Order
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
