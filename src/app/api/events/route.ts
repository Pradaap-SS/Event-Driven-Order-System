import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type     = searchParams.get("type");
  const status   = searchParams.get("status");
  const search   = searchParams.get("search")?.toLowerCase();
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = 50;

  let events = store.getAllEvents().reverse(); // newest first

  if (type   && type   !== "ALL") events = events.filter((e) => e.type   === type);
  if (status && status !== "ALL") events = events.filter((e) => e.status === status);
  if (search) events = events.filter(
    (e) => e.type.toLowerCase().includes(search) ||
           e.producer.toLowerCase().includes(search) ||
           e.aggregateId.includes(search) ||
           e.correlationId.includes(search)
  );

  const total  = events.length;
  const paged  = events.slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({ events: paged, total, page, pageSize, pages: Math.ceil(total / pageSize) });
}
