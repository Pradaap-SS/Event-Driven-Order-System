"use client";

import type { Order, DomainEvent, OrderStatus, EventType } from "@/lib/types";

// ─── Which states were actually visited ──────────────────────────────────────

const EVENT_TO_STATE: Partial<Record<EventType, OrderStatus>> = {
  OrderCreated:               "CREATED",
  OrderValidated:             "VALIDATED",
  OrderValidationFailed:      "VALIDATION_FAILED",
  InventoryReserved:          "INVENTORY_RESERVED",
  InventoryReservationFailed: "INVENTORY_FAILED",
  PaymentProcessed:           "PAYMENT_PROCESSED",
  PaymentFailed:              "PAYMENT_FAILED",
  OrderConfirmed:             "CONFIRMED",
  CompensationStarted:        "COMPENSATION_STARTED",
  OrderCompensated:           "COMPENSATED",
  EventDeadLettered:          "DEAD_LETTERED",
};

function visitedStates(events: DomainEvent[]): Set<OrderStatus> {
  const s = new Set<OrderStatus>();
  for (const e of events) {
    const state = EVENT_TO_STATE[e.type];
    if (state) s.add(state);
  }
  return s;
}

// ─── Node / edge config ───────────────────────────────────────────────────────

const W = 118; // box width
const H = 36;  // box height
const R = 5;   // border radius

// x = left edge, y = top edge
const NODES: Record<OrderStatus, { x: number; y: number; label: string }> = {
  CREATED:              { x: 8,   y: 18,  label: "CREATED" },
  VALIDATED:            { x: 152, y: 18,  label: "VALIDATED" },
  INVENTORY_RESERVED:   { x: 296, y: 18,  label: "INV. RESERVED" },
  PAYMENT_PROCESSED:    { x: 440, y: 18,  label: "PAYMENT OK" },
  CONFIRMED:            { x: 620, y: 18,  label: "CONFIRMED" },
  VALIDATION_FAILED:    { x: 152, y: 112, label: "VAL. FAILED" },
  INVENTORY_FAILED:     { x: 296, y: 112, label: "INV. FAILED" },
  PAYMENT_FAILED:       { x: 440, y: 112, label: "PAY. FAILED" },
  DEAD_LETTERED:        { x: 620, y: 112, label: "DEAD LETTER" },
  COMPENSATION_STARTED: { x: 344, y: 204, label: "COMPENSATING" },
  COMPENSATED:          { x: 344, y: 278, label: "COMPENSATED" },
};

// Color palette per state
const PALETTE: Record<OrderStatus, { bg: string; border: string; text: string; dim: string; dimBorder: string }> = {
  CREATED:              { bg:"#27272a", border:"#52525b", text:"#d4d4d8", dim:"#111113", dimBorder:"#2a2a2e" },
  VALIDATED:            { bg:"#1e3a5f", border:"#3b82f6", text:"#93c5fd", dim:"#0d1a2e", dimBorder:"#1e2d45" },
  INVENTORY_RESERVED:   { bg:"#134e4a", border:"#14b8a6", text:"#5eead4", dim:"#0a2625", dimBorder:"#143e3a" },
  PAYMENT_PROCESSED:    { bg:"#2e1065", border:"#a855f7", text:"#d8b4fe", dim:"#150a30", dimBorder:"#271050" },
  CONFIRMED:            { bg:"#14532d", border:"#22c55e", text:"#86efac", dim:"#0a2814", dimBorder:"#133d20" },
  VALIDATION_FAILED:    { bg:"#431407", border:"#ea580c", text:"#fdba74", dim:"#1c0a03", dimBorder:"#301005" },
  INVENTORY_FAILED:     { bg:"#431407", border:"#ea580c", text:"#fdba74", dim:"#1c0a03", dimBorder:"#301005" },
  PAYMENT_FAILED:       { bg:"#450a0a", border:"#ef4444", text:"#fca5a5", dim:"#1a0505", dimBorder:"#2e0808" },
  DEAD_LETTERED:        { bg:"#450a0a", border:"#dc2626", text:"#fca5a5", dim:"#1a0505", dimBorder:"#2e0808" },
  COMPENSATION_STARTED: { bg:"#422006", border:"#f59e0b", text:"#fcd34d", dim:"#1a0e03", dimBorder:"#2e1a05" },
  COMPENSATED:          { bg:"#1c1917", border:"#78716c", text:"#d6d3d1", dim:"#111110", dimBorder:"#1c1917" },
};

// Directed edges: [from, to, label, style]
type EdgeStyle = "happy" | "fail" | "comp" | "dlq";
type Edge = [OrderStatus, OrderStatus, string, EdgeStyle];

const EDGES: Edge[] = [
  // Happy path
  ["CREATED",            "VALIDATED",          "OrderValidated",            "happy"],
  ["VALIDATED",          "INVENTORY_RESERVED",  "InventoryReserved",         "happy"],
  ["INVENTORY_RESERVED", "PAYMENT_PROCESSED",   "PaymentProcessed",          "happy"],
  ["PAYMENT_PROCESSED",  "CONFIRMED",           "OrderConfirmed",            "happy"],
  // Failure branches
  ["VALIDATED",          "VALIDATION_FAILED",   "ValidationFailed",          "fail"],
  ["INVENTORY_RESERVED", "INVENTORY_FAILED",    "ReservationFailed",         "fail"],
  ["PAYMENT_PROCESSED",  "PAYMENT_FAILED",      "PaymentFailed",             "fail"],
  // Compensation
  ["INVENTORY_FAILED",   "COMPENSATION_STARTED","CompensationStarted",       "comp"],
  ["PAYMENT_FAILED",     "COMPENSATION_STARTED","CompensationStarted",       "comp"],
  ["COMPENSATION_STARTED","COMPENSATED",        "OrderCompensated",          "comp"],
  // DLQ escape
  ["PAYMENT_FAILED",     "DEAD_LETTERED",       "max retries (3×)",          "dlq"],
];

// Edge colors when active
const EDGE_COLOR: Record<EdgeStyle, string> = {
  happy: "#6366f1",
  fail:  "#f97316",
  comp:  "#f59e0b",
  dlq:   "#dc2626",
};

// Which edge is considered "active" given an order's current + visited states
function isEdgeActive(from: OrderStatus, to: OrderStatus, visited: Set<OrderStatus>): boolean {
  return visited.has(from) && visited.has(to);
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function cx(status: OrderStatus) { return NODES[status].x + W / 2; }
function cy(status: OrderStatus) { return NODES[status].y + H / 2; }
function top(status: OrderStatus) { return NODES[status].y; }
function bot(status: OrderStatus) { return NODES[status].y + H; }
function left(status: OrderStatus) { return NODES[status].x; }
function right(status: OrderStatus) { return NODES[status].x + W; }

// Arrowhead marker id → color key
const MARKERS = ["happy", "fail", "comp", "dlq", "dim"] as const;

// ─── Component ────────────────────────────────────────────────────────────────

interface SagaDiagramProps {
  order: Order;
  events: DomainEvent[];
}

export function SagaDiagram({ order, events }: SagaDiagramProps) {
  const visited = visitedStates(events);
  const current = order.status;

  function nodeState(status: OrderStatus): "current" | "visited" | "idle" {
    if (status === current) return "current";
    if (visited.has(status))  return "visited";
    return "idle";
  }

  return (
    <svg
      viewBox="0 0 760 330"
      className="w-full"
      fill="none"
      aria-label="Order saga state machine"
    >
      {/* ── Marker definitions ── */}
      <defs>
        {MARKERS.map((key) => {
          const color = key === "dim" ? "#3f3f46"
            : key === "happy" ? EDGE_COLOR.happy
            : key === "fail"  ? EDGE_COLOR.fail
            : key === "comp"  ? EDGE_COLOR.comp
            : EDGE_COLOR.dlq;
          return (
            <marker
              key={key}
              id={`saga-arrow-${key}`}
              markerWidth="7" markerHeight="7"
              refX="5" refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L7,3 z" fill={color} />
            </marker>
          );
        })}
        {/* Glow filter for current state */}
        <filter id="saga-glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── Edges ── */}
      {EDGES.map(([from, to, label, style]) => {
        const active = isEdgeActive(from, to, visited);
        const color  = active ? EDGE_COLOR[style] : "#3f3f46";
        const marker = active ? `saga-arrow-${style}` : "saga-arrow-dim";
        const dash   = style === "dlq" ? "5 3" : undefined;

        // Determine path based on edge topology
        let d: string;
        const labelX: number = (cx(from) + cx(to)) / 2;
        const labelY: number = (cy(from) + cy(to)) / 2 - 5;

        if (from === "CREATED" && to === "VALIDATED") {
          // Horizontal: right edge of CREATED → left edge of VALIDATED
          d = `M${right(from)} ${cy(from)} L${left(to)} ${cy(to)}`;
        } else if (from === "VALIDATED" && to === "INVENTORY_RESERVED") {
          d = `M${right(from)} ${cy(from)} L${left(to)} ${cy(to)}`;
        } else if (from === "INVENTORY_RESERVED" && to === "PAYMENT_PROCESSED") {
          d = `M${right(from)} ${cy(from)} L${left(to)} ${cy(to)}`;
        } else if (from === "PAYMENT_PROCESSED" && to === "CONFIRMED") {
          // Longer gap — draw through the gap
          d = `M${right(from)} ${cy(from)} L${left(to)} ${cy(to)}`;
        } else if (
          (from === "VALIDATED" && to === "VALIDATION_FAILED") ||
          (from === "INVENTORY_RESERVED" && to === "INVENTORY_FAILED") ||
          (from === "PAYMENT_PROCESSED" && to === "PAYMENT_FAILED")
        ) {
          // Straight drop
          d = `M${cx(from)} ${bot(from)} L${cx(to)} ${top(to)}`;
        } else if (from === "INVENTORY_FAILED" && to === "COMPENSATION_STARTED") {
          // Diagonal down-right
          d = `M${cx(from)} ${bot(from)} L${cx(to)} ${top(to)}`;
        } else if (from === "PAYMENT_FAILED" && to === "COMPENSATION_STARTED") {
          // Diagonal down-left
          d = `M${cx(from)} ${bot(from)} L${cx(to)} ${top(to)}`;
        } else if (from === "COMPENSATION_STARTED" && to === "COMPENSATED") {
          // Straight drop
          d = `M${cx(from)} ${bot(from)} L${cx(to)} ${top(to)}`;
        } else if (from === "PAYMENT_FAILED" && to === "DEAD_LETTERED") {
          // Elbow: right then across
          const elbowX = right(to) + 14;
          d = `M${right(from)} ${cy(from)} L${elbowX} ${cy(from)} L${elbowX} ${cy(to)} L${right(to)} ${cy(to)}`;
        } else {
          d = `M${cx(from)} ${bot(from)} L${cx(to)} ${top(to)}`;
        }

        // Happy-path arrow label position (above arrow, horizontal only)
        const isHappy = style === "happy";

        return (
          <g key={`${from}-${to}`}>
            <path
              d={d}
              stroke={color}
              strokeWidth={active ? 1.5 : 1}
              strokeDasharray={dash}
              opacity={active ? 1 : 0.35}
              markerEnd={`url(#${marker})`}
            />
            {isHappy && (
              <text
                x={labelX}
                y={cy(from) - 6}
                textAnchor="middle"
                fill={active ? color : "#3f3f46"}
                fontSize="7"
                fontFamily="monospace"
                opacity={active ? 0.9 : 0.35}
              >
                {label}
              </text>
            )}
            {style === "dlq" && (
              <text
                x={right(from) + 28}
                y={cy(from) - 6}
                textAnchor="middle"
                fill={active ? color : "#3f3f46"}
                fontSize="7"
                fontFamily="monospace"
                opacity={active ? 0.9 : 0.35}
              >
                {label}
              </text>
            )}
          </g>
        );
      })}

      {/* ── State boxes ── */}
      {(Object.keys(NODES) as OrderStatus[]).map((status) => {
        const { x, y, label } = NODES[status];
        const state   = nodeState(status);
        const palette = PALETTE[status];
        const isTerminalSuccess = status === "CONFIRMED";
        const isTerminalFail    = status === "DEAD_LETTERED";
        const isTerminalComp    = status === "COMPENSATED";

        const bg     = state === "idle" ? palette.dim    : palette.bg;
        const border = state === "idle" ? palette.dimBorder : palette.border;
        const text   = state === "idle" ? palette.dimBorder : palette.text;

        return (
          <g key={status} filter={state === "current" ? "url(#saga-glow)" : undefined}>
            {/* Outer glow ring for current state */}
            {state === "current" && (
              <rect
                x={x - 3} y={y - 3}
                width={W + 6} height={H + 6}
                rx={R + 2}
                fill="none"
                stroke={palette.border}
                strokeWidth="1.5"
                opacity="0.4"
              />
            )}

            {/* Main box */}
            <rect
              x={x} y={y}
              width={W} height={H}
              rx={R}
              fill={bg}
              stroke={border}
              strokeWidth={state === "current" ? 1.5 : 1}
            />

            {/* State label */}
            <text
              x={x + W / 2}
              y={y + H / 2 + (isTerminalSuccess || isTerminalFail || isTerminalComp ? 0 : 1)}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={state === "idle" ? "#374151" : text}
              fontSize="9"
              fontFamily="monospace"
              fontWeight={state === "current" ? "700" : "500"}
              letterSpacing="0.5"
            >
              {label}
            </text>

            {/* Terminal state icons */}
            {isTerminalSuccess && state !== "idle" && (
              <text x={x + W - 10} y={y + 12} fill={palette.text} fontSize="10" opacity="0.8">✓</text>
            )}
            {(isTerminalFail || isTerminalComp) && state !== "idle" && (
              <text x={x + W - 10} y={y + 12} fill={palette.text} fontSize="9" opacity="0.8">
                {isTerminalFail ? "✗" : "↩"}
              </text>
            )}

            {/* Current state pulsing dot */}
            {state === "current" && (
              <circle cx={x + 10} cy={y + H / 2} r="3" fill={palette.border} opacity="0.9">
                <animate attributeName="opacity" values="0.9;0.2;0.9" dur="1.5s" repeatCount="indefinite" />
              </circle>
            )}
          </g>
        );
      })}

      {/* ── Row labels ── */}
      <text x="4" y="10" fill="#374151" fontSize="7" fontFamily="monospace">HAPPY PATH</text>
      <text x="4" y="106" fill="#374151" fontSize="7" fontFamily="monospace">FAILURES</text>
      <text x="4" y="200" fill="#374151" fontSize="7" fontFamily="monospace">COMPENSATION</text>
    </svg>
  );
}
