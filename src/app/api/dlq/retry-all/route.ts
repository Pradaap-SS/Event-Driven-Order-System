import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { requeueDLQEvent } from "@/lib/event-bus";
import "@/domain/handlers";

export async function POST() {
  const pending = store.getAllDLQ().filter((d) => !d.resolvedAt);
  let retried = 0;
  for (const dlq of pending) {
    if (requeueDLQEvent(dlq.id)) retried++;
  }
  return NextResponse.json({ ok: true, retried, total: pending.length });
}
