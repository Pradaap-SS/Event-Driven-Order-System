/**
 * Database connection — auto-detects DATABASE_URL and returns a Postgres client.
 * Returns null when DATABASE_URL is not set (in-memory mode).
 *
 * Compatible with Neon Postgres (serverless driver), Supabase, and any
 * standard Postgres connection string.
 */

import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __pgClient: ReturnType<typeof postgres> | null | undefined;
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  return postgres(url, {
    ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
    max: 10,
    idle_timeout: 30,
    connection: { application_name: "orderflow" },
  });
}

export const sql: ReturnType<typeof postgres> | null =
  (global.__pgClient ??= createClient());

export const isPostgres = sql !== null;
