import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { runDemoScenario } from "@/lib/seed";
import "@/domain/handlers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { count?: number };
    const count = Math.min(Math.max(Math.round(body.count ?? 5), 1), 100);
    store.reset();
    const result = await runDemoScenario(count);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  store.reset();
  return NextResponse.json({ ok: true, message: "Store cleared" });
}
