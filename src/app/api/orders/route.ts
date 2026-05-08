import { NextRequest, NextResponse } from "next/server";
import { createOrder } from "@/domain/order.service";
import { store } from "@/lib/store";
import { processNextBatch } from "@/lib/event-bus";
import "@/domain/handlers";

export async function GET(req: NextRequest) {
  // Piggy-back event processing on the orders poll (Orders page, Failure Lab).
  await processNextBatch(10);
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search")?.toLowerCase();

  let orders = store.getAllOrders();

  if (status && status !== "ALL") {
    orders = orders.filter((o) => o.status === status);
  }
  if (search) {
    orders = orders.filter(
      (o) =>
        o.customerName.toLowerCase().includes(search) ||
        o.id.toLowerCase().includes(search) ||
        o.customerEmail.toLowerCase().includes(search)
    );
  }

  return NextResponse.json({ orders, total: orders.length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await createOrder(body);
    return NextResponse.json(result, {
      status: result.status === "DUPLICATE" ? 200 : 201,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 }
    );
  }
}
