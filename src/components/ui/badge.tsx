"use client";

import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/types";
import { STATUS_CONFIG } from "@/lib/utils";

interface StatusBadgeProps {
  status: OrderStatus;
  pulse?: boolean;
}

export function StatusBadge({ status, pulse }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        config.bg,
        config.color
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          config.dot,
          pulse && "animate-pulse"
        )}
      />
      {config.label}
    </span>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "muted";
  className?: string;
}

const variantClasses: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-zinc-800/60 text-zinc-400",
  success: "bg-green-900/30 text-green-400",
  warning: "bg-yellow-900/30 text-yellow-400",
  danger:  "bg-red-900/30 text-red-400",
  info:    "bg-blue-900/30 text-blue-400",
  muted:   "bg-zinc-900 text-zinc-500",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
