/**
 * Event log export — returns the complete event chain as NDJSON.
 *
 * Each line is one self-contained JSON record (Newline-Delimited JSON).
 * Suitable for piping into jq, loading into BigQuery, or replaying
 * against a test environment.
 *
 * Example usage:
 *   curl .../api/orders/{id}/export > order.ndjson
 *   cat order.ndjson | jq '.type'
 */

import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const order = store.getOrder(params.id);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const events = store.getEventsForOrder(params.id);

  // NDJSON: one JSON object per line
  const ndjson = [
    // Metadata header line
    JSON.stringify({
      _meta:     true,
      orderId:   order.id,
      customer:  order.customerName,
      status:    order.status,
      events:    events.length,
      exportedAt: new Date().toISOString(),
    }),
    ...events.map((e) => JSON.stringify(e)),
  ].join("\n");

  return new NextResponse(ndjson, {
    headers: {
      "Content-Type":        "application/x-ndjson",
      "Content-Disposition": `attachment; filename="order-${params.id.slice(0, 8)}.ndjson"`,
      "Cache-Control":       "no-store",
    },
  });
}
