import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";

export const metadata: Metadata = {
  title: "OrderFlow — Event-Driven Order System",
  description:
    "Portfolio-grade distributed order processing system demonstrating Kafka-style event-driven architecture, CQRS, saga compensation, and DLQ patterns.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme — runs before React hydrates */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var t = localStorage.getItem('orderflow-theme');
            var sys = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
            var theme = t || sys;
            if (theme === 'light') document.documentElement.classList.remove('dark');
            else document.documentElement.classList.add('dark');
          })();
        `}} />
      </head>
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="ml-60 flex-1 min-h-screen">{children}</main>
        </div>
      </body>
    </html>
  );
}
