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
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="ml-60 flex-1 min-h-screen">{children}</main>
        </div>
      </body>
    </html>
  );
}
