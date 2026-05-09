import { NextRequest, NextResponse } from "next/server";
import { getAllBreakerStats, resetBreaker, resetAllBreakers } from "@/lib/circuit-breaker";
import "@/domain/handlers"; // ensure breakers are registered

export async function GET() {
  return NextResponse.json({ breakers: getAllBreakerStats() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { name?: string };
  if (body.name) {
    const ok = resetBreaker(body.name);
    return NextResponse.json({ ok, name: body.name });
  }
  resetAllBreakers();
  return NextResponse.json({ ok: true, message: "All circuit breakers reset" });
}
