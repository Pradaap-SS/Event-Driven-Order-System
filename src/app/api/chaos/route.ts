import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET() {
  return NextResponse.json(store.getChaos());
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    store.setChaos(body);
    return NextResponse.json({ ok: true, chaos: store.getChaos() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 }
    );
  }
}
