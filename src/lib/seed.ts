/**
 * Seed data — 50 customers, 25 products.
 *
 * runDemoScenario(count) distributes ALL orders across the 5 canonical scenario
 * types by cycling: happy → payment-fail → inventory-fail → idempotency → delayed.
 * For count=10 you get 2 of each; for count=25 you get 5 of each; etc.
 * There are no random filler orders.
 */

import { store } from "./store";
import { createOrder } from "@/domain/order.service";
import { processNextBatch } from "./event-bus";
import "@/domain/handlers";

// ─── Customers ────────────────────────────────────────────────────────────────

export const CUSTOMERS = [
  { id: "cust_001", customerName: "Aisha Patel",        customerEmail: "aisha.patel@corp.io" },
  { id: "cust_002", customerName: "Marcus Webb",         customerEmail: "m.webb@corp.io" },
  { id: "cust_003", customerName: "Yuki Tanaka",         customerEmail: "yuki.tanaka@corp.io" },
  { id: "cust_004", customerName: "Jordan Mills",        customerEmail: "jordan.mills@corp.io" },
  { id: "cust_005", customerName: "Priya Sharma",        customerEmail: "p.sharma@corp.io" },
  { id: "cust_006", customerName: "Devon Carter",        customerEmail: "d.carter@corp.io" },
  { id: "cust_007", customerName: "Mei-Lin Zhang",       customerEmail: "meilin.z@corp.io" },
  { id: "cust_008", customerName: "Santiago Cruz",       customerEmail: "s.cruz@corp.io" },
  { id: "cust_009", customerName: "Fatima Al-Rashid",   customerEmail: "f.alrashid@corp.io" },
  { id: "cust_010", customerName: "Ethan Brooks",        customerEmail: "e.brooks@corp.io" },
  { id: "cust_011", customerName: "Naomi Osei",          customerEmail: "n.osei@corp.io" },
  { id: "cust_012", customerName: "Liam O'Brien",        customerEmail: "l.obrien@corp.io" },
  { id: "cust_013", customerName: "Zara Khan",           customerEmail: "z.khan@corp.io" },
  { id: "cust_014", customerName: "Carlos Rivera",       customerEmail: "c.rivera@corp.io" },
  { id: "cust_015", customerName: "Ingrid Johansson",   customerEmail: "i.johansson@corp.io" },
  { id: "cust_016", customerName: "Kwame Asante",        customerEmail: "k.asante@corp.io" },
  { id: "cust_017", customerName: "Sofia Marchetti",     customerEmail: "s.marchetti@corp.io" },
  { id: "cust_018", customerName: "James Okafor",        customerEmail: "j.okafor@corp.io" },
  { id: "cust_019", customerName: "Hana Nakamura",       customerEmail: "h.nakamura@corp.io" },
  { id: "cust_020", customerName: "Ryan Fitzgerald",     customerEmail: "r.fitz@corp.io" },
  { id: "cust_021", customerName: "Amara Diallo",        customerEmail: "a.diallo@corp.io" },
  { id: "cust_022", customerName: "Lucas Schneider",     customerEmail: "l.schneider@corp.io" },
  { id: "cust_023", customerName: "Maya Goldstein",      customerEmail: "m.goldstein@corp.io" },
  { id: "cust_024", customerName: "Omar Hassan",         customerEmail: "o.hassan@corp.io" },
  { id: "cust_025", customerName: "Chloe Martineau",     customerEmail: "c.martineau@corp.io" },
  { id: "cust_026", customerName: "Arjun Mehta",         customerEmail: "a.mehta@corp.io" },
  { id: "cust_027", customerName: "Isabelle Dupont",     customerEmail: "i.dupont@corp.io" },
  { id: "cust_028", customerName: "Theo Andersen",       customerEmail: "t.andersen@corp.io" },
  { id: "cust_029", customerName: "Layla Hussain",       customerEmail: "l.hussain@corp.io" },
  { id: "cust_030", customerName: "Finn MacGregor",      customerEmail: "f.macgregor@corp.io" },
  { id: "cust_031", customerName: "Adaeze Nwosu",        customerEmail: "a.nwosu@corp.io" },
  { id: "cust_032", customerName: "Viktor Petrov",       customerEmail: "v.petrov@corp.io" },
  { id: "cust_033", customerName: "Leila Moradi",        customerEmail: "l.moradi@corp.io" },
  { id: "cust_034", customerName: "Antoine Beaumont",    customerEmail: "a.beaumont@corp.io" },
  { id: "cust_035", customerName: "Sienna Walsh",        customerEmail: "s.walsh@corp.io" },
  { id: "cust_036", customerName: "Hiroshi Yamamoto",   customerEmail: "h.yamamoto@corp.io" },
  { id: "cust_037", customerName: "Valentina Rossi",     customerEmail: "v.rossi@corp.io" },
  { id: "cust_038", customerName: "Kofi Mensah",         customerEmail: "k.mensah@corp.io" },
  { id: "cust_039", customerName: "Emma Lindqvist",      customerEmail: "e.lindqvist@corp.io" },
  { id: "cust_040", customerName: "Rafael Sousa",        customerEmail: "r.sousa@corp.io" },
  { id: "cust_041", customerName: "Neha Gupta",          customerEmail: "n.gupta@corp.io" },
  { id: "cust_042", customerName: "Ian Crawford",        customerEmail: "i.crawford@corp.io" },
  { id: "cust_043", customerName: "Amina Traore",        customerEmail: "a.traore@corp.io" },
  { id: "cust_044", customerName: "Benedict Hofer",      customerEmail: "b.hofer@corp.io" },
  { id: "cust_045", customerName: "Xiomara Castillo",    customerEmail: "x.castillo@corp.io" },
  { id: "cust_046", customerName: "Dmitri Volkov",       customerEmail: "d.volkov@corp.io" },
  { id: "cust_047", customerName: "Nadia Okonkwo",       customerEmail: "n.okonkwo@corp.io" },
  { id: "cust_048", customerName: "Patrick Svensson",    customerEmail: "p.svensson@corp.io" },
  { id: "cust_049", customerName: "Rohan Desai",         customerEmail: "r.desai@corp.io" },
  { id: "cust_050", customerName: "Clara Bergmann",      customerEmail: "c.bergmann@corp.io" },
];

// ─── Products ─────────────────────────────────────────────────────────────────

export const PRODUCTS = [
  { sku: "SKU-A100", name: "Wireless Headset Pro",          unitPrice: 149.99 },
  { sku: "SKU-A200", name: "Noise-Cancelling Earbuds",      unitPrice: 179.00 },
  { sku: "SKU-A300", name: "Video Conference Speakerphone", unitPrice: 219.00 },
  { sku: "SKU-B100", name: "Mechanical Keyboard v3",        unitPrice: 89.50 },
  { sku: "SKU-B200", name: "Mechanical Numpad Compact",     unitPrice: 65.00 },
  { sku: "SKU-B300", name: "Keyboard Wrist Rest",           unitPrice: 24.99 },
  { sku: "SKU-C100", name: "4K Webcam Ultra",               unitPrice: 199.00 },
  { sku: "SKU-C200", name: "Webcam Ring Light 12\"",        unitPrice: 44.99 },
  { sku: "SKU-C300", name: "Privacy Screen Filter 27\"",    unitPrice: 39.99 },
  { sku: "SKU-D100", name: "USB-C Hub 7-in-1",              unitPrice: 59.99 },
  { sku: "SKU-D200", name: "USB-C Power Bank 20K",          unitPrice: 54.99 },
  { sku: "SKU-D300", name: "Wireless Charging Pad 3-in-1",  unitPrice: 49.99 },
  { sku: "SKU-E100", name: "Ergonomic Mouse Pad XL",        unitPrice: 29.95 },
  { sku: "SKU-E200", name: "Vertical Mouse Ergonomic",      unitPrice: 69.99 },
  { sku: "SKU-E300", name: "Bluetooth Presenter Remote",    unitPrice: 39.99 },
  { sku: "SKU-F100", name: "Standing Desk Converter",       unitPrice: 349.00 },
  { sku: "SKU-F200", name: "Monitor Arm Dual",              unitPrice: 129.00 },
  { sku: "SKU-F300", name: "Laptop Stand Aluminum",         unitPrice: 49.99 },
  { sku: "SKU-G100", name: "LED Desk Lamp Smart",           unitPrice: 79.99 },
  { sku: "SKU-G200", name: "Desk Organizer Premium",        unitPrice: 34.99 },
  { sku: "SKU-G300", name: "Adjustable Footrest",           unitPrice: 45.00 },
  { sku: "SKU-H100", name: "Portable SSD 1TB",              unitPrice: 109.99 },
  { sku: "SKU-H200", name: "Laptop Sleeve 15\"",            unitPrice: 29.99 },
  { sku: "SKU-H300", name: "Cable Management Kit",          unitPrice: 19.99 },
  { sku: "SKU-H400", name: "Screen Cleaning Kit Pro",       unitPrice: 14.99 },
];

// ─── Canonical scenario types ─────────────────────────────────────────────────

const SCENARIO_CYCLE = [
  "happy",
  "payment-fail",
  "inventory-fail",
  "idempotency",
  "delayed",
] as const;

type ScenarioType = typeof SCENARIO_CYCLE[number];

function custFor(slotIndex: number) {
  return CUSTOMERS[slotIndex % CUSTOMERS.length];
}

function prodFor(slotIndex: number) {
  return PRODUCTS[slotIndex % PRODUCTS.length];
}

function prod2For(slotIndex: number) {
  return PRODUCTS[(slotIndex + 7) % PRODUCTS.length];
}

// ─── Drain helper ─────────────────────────────────────────────────────────────

async function drainQueue(maxWaitMs = 20_000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const active = store.getAllEvents().filter(
      (e) => e.status === "PENDING" || e.status === "PROCESSING"
    );
    if (active.length === 0) break;
    await processNextBatch(20);
    await new Promise((r) => setTimeout(r, 250));
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function runDemoScenario(count: number = 5): Promise<{
  orderIds: string[];
  message: string;
}> {
  // Split `count` slots by cycling through the 5 canonical types.
  // e.g. count=10 → 2 happy, 2 payment-fail, 2 inventory-fail, 2 idempotency, 2 delayed
  const slots: Record<ScenarioType, number[]> = {
    "happy":          [],
    "payment-fail":   [],
    "inventory-fail": [],
    "idempotency":    [],
    "delayed":        [],
  };

  for (let i = 0; i < count; i++) {
    slots[SCENARIO_CYCLE[i % 5]].push(i);
  }

  const orderIds: string[] = [];
  let duplicatesRejected = 0;

  // ── 1. Happy path ────────────────────────────────────────────────────────
  if (slots.happy.length > 0) {
    store.setChaos({ paymentFailureRate: 0, inventoryFailureRate: 0, processingDelayMs: 0 });
    for (const i of slots.happy) {
      const c = custFor(i);
      const r = await createOrder({
        customerId: c.id, customerName: c.customerName, customerEmail: c.customerEmail,
        items: [
          { ...prodFor(i),  quantity: 1 },
          { ...prod2For(i), quantity: 2 },
        ],
        notes: `Canonical: happy path #${slots.happy.indexOf(i) + 1}`,
      });
      orderIds.push(r.orderId);
    }
    await drainQueue();
  }

  // ── 2. Payment failure → compensation ────────────────────────────────────
  if (slots["payment-fail"].length > 0) {
    store.setChaos({ paymentFailureRate: 1, inventoryFailureRate: 0, processingDelayMs: 0 });
    for (const i of slots["payment-fail"]) {
      const c = custFor(i);
      const r = await createOrder({
        customerId: c.id, customerName: c.customerName, customerEmail: c.customerEmail,
        items: [{ ...prodFor(i), quantity: 1 }],
        notes: `Canonical: payment failure #${slots["payment-fail"].indexOf(i) + 1}`,
      });
      orderIds.push(r.orderId);
    }
    await drainQueue();
    store.setChaos({ paymentFailureRate: 0 });
  }

  // ── 3. Inventory failure → compensation ──────────────────────────────────
  if (slots["inventory-fail"].length > 0) {
    store.setChaos({ inventoryFailureRate: 1, paymentFailureRate: 0, processingDelayMs: 0 });
    for (const i of slots["inventory-fail"]) {
      const c = custFor(i);
      const r = await createOrder({
        customerId: c.id, customerName: c.customerName, customerEmail: c.customerEmail,
        items: [{ ...prodFor(i), quantity: 3 }],
        notes: `Canonical: inventory failure #${slots["inventory-fail"].indexOf(i) + 1}`,
      });
      orderIds.push(r.orderId);
    }
    await drainQueue();
    store.setChaos({ inventoryFailureRate: 0 });
  }

  // ── 4. Idempotency (duplicate rejected) ──────────────────────────────────
  if (slots.idempotency.length > 0) {
    store.setChaos({ paymentFailureRate: 0, inventoryFailureRate: 0, processingDelayMs: 0 });
    for (const i of slots.idempotency) {
      const c = custFor(i);
      const idemKey = `demo-idem-${i}-${Date.now()}`;
      const r = await createOrder({
        customerId: c.id, customerName: c.customerName, customerEmail: c.customerEmail,
        items: [{ ...prodFor(i), quantity: 1 }],
        idempotencyKey: idemKey,
        notes: `Canonical: idempotency #${slots.idempotency.indexOf(i) + 1} (original)`,
      });
      // Replay the exact same command — must be rejected
      await createOrder({
        customerId: c.id, customerName: c.customerName, customerEmail: c.customerEmail,
        items: [{ ...prodFor(i), quantity: 1 }],
        idempotencyKey: idemKey,
        notes: `Canonical: idempotency #${slots.idempotency.indexOf(i) + 1} (duplicate)`,
      });
      duplicatesRejected++;
      orderIds.push(r.orderId);
    }
    await drainQueue();
  }

  // ── 5. Delayed (left in-flight — delay stays active so the dashboard shows
  //        live progression over the next ~8s after the demo completes) ──────
  if (slots.delayed.length > 0) {
    store.setChaos({ processingDelayMs: 800, paymentFailureRate: 0, inventoryFailureRate: 0 });
    for (const i of slots.delayed) {
      const c = custFor(i);
      const r = await createOrder({
        customerId: c.id, customerName: c.customerName, customerEmail: c.customerEmail,
        items: [
          { ...prodFor(i),  quantity: 1 },
          { ...prod2For(i), quantity: 1 },
        ],
        notes: `Canonical: delayed #${slots.delayed.indexOf(i) + 1} (800ms/event)`,
      });
      orderIds.push(r.orderId);
    }
    // Do NOT reset processingDelayMs — leave it at 800ms so these orders
    // process visibly through the pipeline over the next ~8s. The user can
    // reset it in the Failure Lab, or it clears on the next demo run.
  } else {
    // No delayed orders — ensure chaos is fully clean
    store.setChaos({ processingDelayMs: 0, paymentFailureRate: 0, inventoryFailureRate: 0 });
  }

  const parts = [
    `${slots.happy.length} happy`,
    `${slots["payment-fail"].length} payment-fail`,
    `${slots["inventory-fail"].length} inv-fail`,
    `${slots.idempotency.length} idempotency (${duplicatesRejected} rejected)`,
    `${slots.delayed.length} delayed`,
  ];

  return {
    orderIds,
    message: `${count} canonical orders — ${parts.join(" · ")}`,
  };
}
