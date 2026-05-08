/**
 * Event processor endpoint — called by the frontend on a polling interval.
 * Simulates a Kafka consumer group pulling from a topic.
 */

import { NextResponse } from "next/server";
import { processNextBatch } from "@/lib/event-bus";
import "@/domain/handlers";

export async function POST() {
  try {
    const result = await processNextBatch(8);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
