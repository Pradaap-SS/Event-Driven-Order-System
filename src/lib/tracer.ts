/**
 * In-process distributed tracer — mirrors the OpenTelemetry data model.
 *
 * Produces spans that map directly to OTel concepts:
 *   traceId   → correlationId (same across all events in one order)
 *   spanId    → unique per handler invocation
 *   parentId  → causationId (the event that triggered this one)
 *   name      → "<service>/<EventType>"
 *   attributes → eventType, aggregateId, retryCount, etc.
 *
 * In production this would be replaced by @opentelemetry/sdk-node exporting
 * to Jaeger/Tempo. The interface is intentionally OTel-compatible so the swap
 * is a one-line change (drop this file, init the real SDK).
 */

import { v4 as uuid } from "uuid";

// ─── Types (mirrors OTel SDK types) ──────────────────────────────────────────

export type SpanStatus = "UNSET" | "OK" | "ERROR";
export type SpanKind   = "INTERNAL" | "SERVER" | "CLIENT" | "PRODUCER" | "CONSUMER";

export interface SpanEvent {
  name:       string;
  timestamp:  number;
  attributes: Record<string, string | number | boolean>;
}

export interface Span {
  // OTel identifiers
  traceId:      string;   // = correlationId
  spanId:       string;
  parentSpanId: string | null;  // = causationId or previous spanId

  // Metadata
  name:       string;     // e.g. "payment-service/PaymentProcessed"
  kind:       SpanKind;
  service:    string;

  // Timing (Unix ms)
  startTime:  number;
  endTime:    number | null;
  durationMs: number | null;

  // Status & payload
  status:       SpanStatus;
  errorMessage: string | null;
  attributes:   Record<string, string | number | boolean>;
  events:       SpanEvent[];
}

// ─── Global span store ────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __traceStore: Map<string, Span[]> | undefined;
}

// Keyed by traceId (= correlationId) for O(1) lookup per order
const traceStore: Map<string, Span[]> =
  (global.__traceStore ??= new Map());

// ─── Tracer API ───────────────────────────────────────────────────────────────

export function startSpan(options: {
  traceId:      string;
  parentSpanId: string | null;
  name:         string;
  service:      string;
  kind?:        SpanKind;
  attributes?:  Record<string, string | number | boolean>;
}): Span {
  const span: Span = {
    traceId:      options.traceId,
    spanId:       uuid(),
    parentSpanId: options.parentSpanId,
    name:         options.name,
    kind:         options.kind ?? "CONSUMER",
    service:      options.service,
    startTime:    Date.now(),
    endTime:      null,
    durationMs:   null,
    status:       "UNSET",
    errorMessage: null,
    attributes:   options.attributes ?? {},
    events:       [],
  };

  const existing = traceStore.get(span.traceId) ?? [];
  existing.push(span);
  traceStore.set(span.traceId, existing);

  return span;
}

export function endSpan(
  span: Span,
  status: SpanStatus = "OK",
  errorMessage?: string
): void {
  span.endTime    = Date.now();
  span.durationMs = span.endTime - span.startTime;
  span.status     = status;
  if (errorMessage) span.errorMessage = errorMessage;
}

export function addSpanEvent(
  span: Span,
  name: string,
  attributes: Record<string, string | number | boolean> = {}
): void {
  span.events.push({ name, timestamp: Date.now(), attributes });
}

export function getTraceForOrder(correlationId: string): Span[] {
  return (traceStore.get(correlationId) ?? []).sort(
    (a, b) => a.startTime - b.startTime
  );
}

export function getAllTraces(): Map<string, Span[]> {
  return traceStore;
}

export function clearTraces(): void {
  traceStore.clear();
}

// ─── Waterfall helpers ────────────────────────────────────────────────────────

export interface WaterfallSpan extends Span {
  offsetMs:    number;  // ms from trace start
  relativeEnd: number;  // offsetMs + durationMs
  depth:       number;  // nesting depth (0 = root)
}

export function buildWaterfall(spans: Span[]): WaterfallSpan[] {
  if (spans.length === 0) return [];

  const traceStart = Math.min(...spans.map((s) => s.startTime));
  const spanById   = new Map(spans.map((s) => [s.spanId, s]));

  function depth(span: Span, seen = new Set<string>()): number {
    if (!span.parentSpanId || seen.has(span.spanId)) return 0;
    seen.add(span.spanId);
    const parent = spanById.get(span.parentSpanId);
    return parent ? 1 + depth(parent, seen) : 0;
  }

  return spans.map((span) => ({
    ...span,
    offsetMs:    span.startTime - traceStart,
    relativeEnd: span.endTime ? span.endTime - traceStart : Date.now() - traceStart,
    depth:       Math.min(depth(span), 5),
  }));
}
