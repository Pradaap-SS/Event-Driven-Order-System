/**
 * Standalone seed script — run `npm run seed` before the first visit.
 * Hits the running dev server's demo endpoint to populate the store.
 */

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";

async function main() {
  console.log("🌱 Seeding demo data via", BASE_URL);

  // Clear existing data
  const clearRes = await fetch(`${BASE_URL}/api/demo`, { method: "DELETE" });
  if (!clearRes.ok) {
    console.error("Failed to clear store:", await clearRes.text());
    process.exit(1);
  }
  console.log("✓ Store cleared");

  // Run demo scenario
  const seedRes = await fetch(`${BASE_URL}/api/demo`, { method: "POST" });
  if (!seedRes.ok) {
    console.error("Failed to seed:", await seedRes.text());
    process.exit(1);
  }
  const data = await seedRes.json() as { message: string; orderIds: string[] };
  console.log("✓", data.message);
  console.log("  Order IDs:", data.orderIds.map((id: string) => id.slice(0, 8) + "…").join(", "));

  // Wait a moment then print metrics
  await new Promise((r) => setTimeout(r, 3000));
  const metricsRes = await fetch(`${BASE_URL}/api/metrics`);
  const metrics = await metricsRes.json() as {
    totalOrders: number;
    successRate: number;
    ordersByStatus: Record<string, number>;
  };
  console.log("\n📊 Current state:");
  console.log("  Total orders:", metrics.totalOrders);
  console.log("  Success rate:", metrics.successRate.toFixed(1) + "%");
  console.log("  By status:", metrics.ordersByStatus);
  console.log("\n✅ Seed complete — open http://localhost:3000");
}

main().catch(console.error);
