import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { OrderStatus, EventType } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(date));
}

export function formatRelative(date: Date | string): string {
  const d = new Date(date);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 1000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

export const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; color: string; bg: string; dot: string }
> = {
  CREATED:              { label: "Created",           color: "text-zinc-400",   bg: "bg-zinc-800/60",   dot: "bg-zinc-400" },
  VALIDATED:            { label: "Validated",         color: "text-blue-400",   bg: "bg-blue-900/30",   dot: "bg-blue-400" },
  INVENTORY_RESERVED:   { label: "Inv. Reserved",     color: "text-cyan-400",   bg: "bg-cyan-900/30",   dot: "bg-cyan-400" },
  PAYMENT_PROCESSED:    { label: "Payment OK",        color: "text-violet-400", bg: "bg-violet-900/30", dot: "bg-violet-400" },
  CONFIRMED:            { label: "Confirmed",         color: "text-green-400",  bg: "bg-green-900/30",  dot: "bg-green-400" },
  VALIDATION_FAILED:    { label: "Validation Failed", color: "text-orange-400", bg: "bg-orange-900/30", dot: "bg-orange-400" },
  INVENTORY_FAILED:     { label: "Inventory Failed",  color: "text-orange-400", bg: "bg-orange-900/30", dot: "bg-orange-400" },
  PAYMENT_FAILED:       { label: "Payment Failed",    color: "text-red-400",    bg: "bg-red-900/30",    dot: "bg-red-400" },
  COMPENSATION_STARTED: { label: "Compensating",      color: "text-yellow-400", bg: "bg-yellow-900/30", dot: "bg-yellow-400" },
  COMPENSATED:          { label: "Compensated",       color: "text-zinc-400",   bg: "bg-zinc-800/60",   dot: "bg-zinc-500" },
  DEAD_LETTERED:        { label: "Dead Letter",       color: "text-red-500",    bg: "bg-red-950/50",    dot: "bg-red-500" },
};

export const EVENT_CONFIG: Record<EventType, { color: string; producer: string }> = {
  OrderCreated:              { color: "text-zinc-400",   producer: "order-service" },
  OrderValidated:            { color: "text-blue-400",   producer: "validation-service" },
  OrderValidationFailed:     { color: "text-orange-400", producer: "validation-service" },
  InventoryReserved:         { color: "text-cyan-400",   producer: "inventory-service" },
  InventoryReservationFailed:{ color: "text-orange-400", producer: "inventory-service" },
  PaymentProcessed:          { color: "text-violet-400", producer: "payment-service" },
  PaymentFailed:             { color: "text-red-400",    producer: "payment-service" },
  OrderConfirmed:            { color: "text-green-400",  producer: "order-service" },
  CompensationStarted:       { color: "text-yellow-400", producer: "compensation-service" },
  OrderCompensated:          { color: "text-zinc-400",   producer: "compensation-service" },
  NotificationQueued:        { color: "text-indigo-400", producer: "order-service" },
  NotificationSent:          { color: "text-indigo-300", producer: "notification-service" },
  EventRetried:              { color: "text-amber-400",  producer: "retry-scheduler" },
  EventDeadLettered:         { color: "text-red-500",    producer: "dlq-processor" },
};

export function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n) + "…" : str;
}
