/**
 * Seed data — realistic demo orders for the "Run Interview Demo" action.
 * Each scenario processes its events immediately while chaos is still active.
 */

import { store } from "./store";
import { createOrder } from "@/domain/order.service";
import { processNextBatch } from "./event-bus";
import "@/domain/handlers";

const CUSTOMERS = [
  { id: "cust_001", customerName: "Aisha Patel",   customerEmail: "aisha@example.com" },
  { id: "cust_002", customerName: "Marcus Webb",   customerEmail: "marcus@example.com" },
  { id: "cust_003", customerName: "Yuki Tanaka",   customerEmail: "yuki@example.com" },
  { id: "cust_004", customerName: "Jordan Mills",  customerEmail: "jordan@example.com" },
  { id: "cust_005", customerName: "Priya Sharma",  customerEmail: "priya@example.com" },
];

const PRODUCTS = [
  { sku: "SKU-A100", name: "Wireless Headset Pro",    unitPrice: 149.99 },
  { sku: "SKU-B200", name: "Mechanical Keyboard v3",  unitPrice: 89.5 },
  { sku: "SKU-C300", name: "4K Webcam Ultra",         unitPrice: 199.0 },
  { sku: "SKU-D400", name: "USB-C Hub 7-in-1",        unitPrice: 59.99 },
  { sku: "SKU-E500", name: "Ergonomic Mouse Pad XL",  unitPrice: 29.95 },
  { sku: "SKU-F600", name: "Standing Desk Converter", unitPrice: 349.0 },
];

function customer(idx: number) {
  const c = CUSTOMERS[idx];
  return { customerId: c.id, customerName: c.customerName, customerEmail: c.customerEmail };
}

/** Drain all pending events, including future-scheduled ones */
async function drainQueue(maxWaitMs = 12_000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const allActive = store.getAllEvents().filter(
      (e) => e.status === "PENDING" || e.status === "PROCESSING"
    );
    if (allActive.length === 0) break;
    await processNextBatch(15);
    await new Promise((r) => setTimeout(r, 250));
  }
}

export async function runDemoScenario(): Promise<{
  orderIds: string[];
  message: string;
}> {
  const orderIds: string[] = [];

  // ── Scenario 1: Happy path ─────────────────────────────────────────────────
  store.setChaos({ paymentFailureRate: 0, inventoryFailureRate: 0, processingDelayMs: 0 });
  const s1 = await createOrder({
    ...customer(0),
    items: [
      { ...PRODUCTS[0], quantity: 1 },
      { ...PRODUCTS[3], quantity: 2 },
    ],
    notes: "Demo: successful order — watch all states turn green",
  });
  orderIds.push(s1.orderId);
  await drainQueue();

  // ── Scenario 2: Payment failure + compensation ─────────────────────────────
  store.setChaos({ paymentFailureRate: 1, inventoryFailureRate: 0, processingDelayMs: 0 });
  const s2 = await createOrder({
    ...customer(1),
    items: [{ ...PRODUCTS[2], quantity: 1 }],
    notes: "Demo: payment failure → saga compensation",
  });
  orderIds.push(s2.orderId);
  await drainQueue();
  store.setChaos({ paymentFailureRate: 0 });

  // ── Scenario 3: Inventory failure + compensation ───────────────────────────
  store.setChaos({ inventoryFailureRate: 1, paymentFailureRate: 0, processingDelayMs: 0 });
  const s3 = await createOrder({
    ...customer(2),
    items: [
      { ...PRODUCTS[5], quantity: 3 },
      { ...PRODUCTS[1], quantity: 1 },
    ],
    notes: "Demo: inventory shortage → saga rollback",
  });
  orderIds.push(s3.orderId);
  await drainQueue();
  store.setChaos({ inventoryFailureRate: 0 });

  // ── Scenario 4: Duplicate event (idempotency test) ────────────────────────
  store.setChaos({ paymentFailureRate: 0, inventoryFailureRate: 0, processingDelayMs: 0 });
  const idempotencyKey = `demo-idem-${Date.now()}`;
  const s4a = await createOrder({
    ...customer(3),
    items: [{ ...PRODUCTS[4], quantity: 2 }],
    idempotencyKey,
    notes: "Demo: original order (idempotency key attached)",
  });
  const s4b = await createOrder({
    ...customer(3),
    items: [{ ...PRODUCTS[4], quantity: 2 }],
    idempotencyKey,
    notes: "Demo: duplicate replay — rejected by idempotency guard",
  });
  orderIds.push(s4a.orderId);
  await drainQueue();

  // ── Scenario 5: Delayed processing ────────────────────────────────────────
  // Use a shorter delay so it still processes during demo drain
  store.setChaos({ processingDelayMs: 800, paymentFailureRate: 0, inventoryFailureRate: 0 });
  const s5 = await createOrder({
    ...customer(4),
    items: [
      { ...PRODUCTS[1], quantity: 1 },
      { ...PRODUCTS[2], quantity: 1 },
      { ...PRODUCTS[3], quantity: 1 },
    ],
    notes: "Demo: 800ms delay injected per event — slower pipeline",
  });
  orderIds.push(s5.orderId);
  // Do NOT drain s5 — leave it in-progress so the UI shows live progression
  store.setChaos({ processingDelayMs: 0 });

  return {
    orderIds,
    message: `Seeded 5 demo scenarios (duplicate: ${s4b.status === "DUPLICATE" ? "✓ rejected" : "not rejected"})`,
  };
}

export { CUSTOMERS, PRODUCTS };
