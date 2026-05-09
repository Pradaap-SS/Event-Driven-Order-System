"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Network,
  Zap,
  FileText,
  Activity,
  Shield,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/dashboard",    label: "Dashboard",   icon: LayoutDashboard },
  { href: "/orders",       label: "Orders",       icon: ShoppingCart },
  { href: "/audit",        label: "Audit Log",    icon: Shield },
  { href: "/architecture", label: "Architecture", icon: Network },
  { href: "/failure-lab",  label: "Failure Lab",  icon: Zap },
  { href: "/design-notes", label: "Design Notes", icon: FileText },
  { href: "/api-docs",     label: "API Docs",     icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();
  const [pendingEvents, setPendingEvents] = useState(0);

  // Lightweight poll for the pending-event count — drives the badge
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const res  = await fetch("/api/metrics");
        if (!res.ok) return;
        const data = await res.json() as { pendingEvents: number };
        setPendingEvents(data.pendingEvents ?? 0);
        timer = setTimeout(tick, data.pendingEvents > 0 ? 1500 : 8000);
      } catch {
        timer = setTimeout(tick, 10_000);
      }
    };

    tick();
    return () => clearTimeout(timer);
  }, []);

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-full w-60 flex-col border-r border-zinc-800/60 bg-zinc-950/95 backdrop-blur-sm">
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-zinc-800/60 px-5 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 shadow-lg shadow-indigo-900/50">
          <Activity className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-100">OrderFlow</p>
          <p className="text-[10px] text-zinc-500 font-mono">event-driven v1.0</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          const showBadge = href === "/orders" && pendingEvents > 0;

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all",
                active
                  ? "bg-indigo-600/15 text-indigo-300 font-medium"
                  : "text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-indigo-400" : "text-zinc-600")} />
              {label}
              <span className="ml-auto flex items-center gap-1.5">
                {showBadge && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white tabular-nums">
                    {pendingEvents > 99 ? "99+" : pendingEvents}
                  </span>
                )}
                {active && !showBadge && (
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                )}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-800/60 px-4 py-3 space-y-2">
        <ThemeToggle />
        <p className="text-[10px] text-zinc-600 font-mono leading-relaxed">
          In-memory event bus · Kafka + K8s sim
        </p>
      </div>
    </aside>
  );
}
