/**
 * Load test endpoint — creates N orders as fast as possible.
 *
 * Demonstrates the write-path throughput: the system accepts orders
 * faster than it can process them, showing the async queue filling up.
 * The event throughput chart on the dashboard will spike visibly.
 */

import { NextRequest, NextResponse } from "next/server";
import { createOrder } from "@/domain/order.service";
import { CUSTOMERS, PRODUCTS } from "@/lib/seed";
import "@/domain/handlers";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { count?: number };
  const count = Math.min(Math.max(Math.round(body.count ?? 50), 1), 500);

  const orderIds: string[] = [];
  const start = Date.now();

  for (let i = 0; i < count; i++) {
    const cust    = CUSTOMERS[i % CUSTOMERS.length];
    const product = PRODUCTS[i % PRODUCTS.length];
    const r = await createOrder({
      customerId:    cust.id,
      customerName:  cust.customerName,
      customerEmail: cust.customerEmail,
      items: [{ ...product, quantity: Math.ceil(Math.random() * 3) }],
      notes: `Load test #${i + 1} of ${count}`,
    });
    orderIds.push(r.orderId);
  }

  return NextResponse.json({
    ok:         true,
    count,
    createdMs:  Date.now() - start,
    ordersPerSec: Math.round(count / ((Date.now() - start) / 1000)),
    sample:     orderIds.slice(0, 3),
  });
}
