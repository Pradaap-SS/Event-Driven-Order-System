import { NextRequest, NextResponse } from "next/server";
import { requeueDLQEvent } from "@/lib/event-bus";
import "@/domain/handlers";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ok = requeueDLQEvent(params.id);
  if (!ok) {
    return NextResponse.json(
      { error: "DLQ event not found or already resolved" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, message: "Event re-queued for processing" });
}
