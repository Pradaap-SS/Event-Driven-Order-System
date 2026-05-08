import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { processNextBatch } from "@/lib/event-bus";
import "@/domain/handlers";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Process pending events before responding — Order Detail polls this every 1s.
  await processNextBatch(10);

  const order = store.getOrder(params.id);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const events = store.getEventsForOrder(params.id);
  const projection = store.getProjection(params.id);
  const dlqEvents = store.getAllDLQ().filter((d) => d.aggregateId === params.id);
  const execLogs = events.flatMap((e) => store.getExecutionLogs(e.id));

  return NextResponse.json({
    order,
    events,
    projection,
    dlqEvents,
    executionLogs: execLogs,
  });
}
