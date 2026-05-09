import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { getTraceForOrder, buildWaterfall } from "@/lib/tracer";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const order = store.getOrder(params.id);
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const spans     = getTraceForOrder(order.correlationId);
  const waterfall = buildWaterfall(spans);

  return NextResponse.json({ correlationId: order.correlationId, spans: waterfall });
}
