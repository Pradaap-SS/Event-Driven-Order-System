"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // On mount, read saved preference (or detect system preference)
  useEffect(() => {
    const saved = localStorage.getItem("orderflow-theme") as "dark" | "light" | null;
    const system = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    apply(saved ?? system);
  }, []);

  function apply(t: "dark" | "light") {
    setTheme(t);
    const root = document.documentElement;
    if (t === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("orderflow-theme", t);
  }

  return (
    <button
      onClick={() => apply(theme === "dark" ? "light" : "dark")}
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors dark:hover:bg-zinc-800 hover:bg-zinc-200"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark"
        ? <Sun className="h-3.5 w-3.5" />
        : <Moon className="h-3.5 w-3.5" />}
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
