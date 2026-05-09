-- OrderFlow — PostgreSQL schema
-- Run once against your Neon / Supabase / Aurora database.
-- Compatible with Postgres 14+.

-- ─── Extension ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Orders ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id      TEXT        NOT NULL,
  customer_name    TEXT        NOT NULL,
  customer_email   TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'CREATED',
  total_amount     NUMERIC(12,2) NOT NULL,
  idempotency_key  TEXT        NOT NULL UNIQUE,
  correlation_id   UUID        NOT NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS orders_status_idx        ON orders (status);
CREATE INDEX IF NOT EXISTS orders_correlation_id_idx ON orders (correlation_id);
CREATE INDEX IF NOT EXISTS orders_created_at_idx     ON orders (created_at DESC);

-- ─── Order Items ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id   UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku        TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  quantity   INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id);

-- ─── Event Log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type                  TEXT        NOT NULL,
  correlation_id        UUID        NOT NULL,
  causation_id          UUID,
  aggregate_id          UUID        NOT NULL,
  payload               JSONB       NOT NULL DEFAULT '{}',
  timestamp             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  producer              TEXT        NOT NULL,
  consumer              TEXT,
  retry_count           INTEGER     NOT NULL DEFAULT 0,
  max_retries           INTEGER     NOT NULL DEFAULT 3,
  status                TEXT        NOT NULL DEFAULT 'PENDING',
  processing_error      TEXT,
  processed_at          TIMESTAMPTZ,
  processing_latency_ms INTEGER
);

CREATE INDEX IF NOT EXISTS events_aggregate_id_idx  ON events (aggregate_id);
CREATE INDEX IF NOT EXISTS events_correlation_id_idx ON events (correlation_id);
CREATE INDEX IF NOT EXISTS events_status_idx         ON events (status);
CREATE INDEX IF NOT EXISTS events_scheduled_for_idx  ON events (scheduled_for)
  WHERE status = 'PENDING';

-- ─── Projections (Read Model) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projections (
  order_id           UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  status             TEXT        NOT NULL,
  customer_name      TEXT        NOT NULL,
  customer_email     TEXT        NOT NULL,
  total_amount       NUMERIC(12,2) NOT NULL,
  event_count        INTEGER     NOT NULL DEFAULT 0,
  retry_count        INTEGER     NOT NULL DEFAULT 0,
  last_event_type    TEXT,
  last_event_time    TIMESTAMPTZ,
  processing_time_ms INTEGER,
  is_in_dlq          BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Dead Letter Queue ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dlq_events (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_event_id  UUID        NOT NULL REFERENCES events(id),
  event_type         TEXT        NOT NULL,
  aggregate_id       UUID        NOT NULL,
  correlation_id     UUID        NOT NULL,
  payload            JSONB       NOT NULL DEFAULT '{}',
  failure_reason     TEXT        NOT NULL,
  retry_count        INTEGER     NOT NULL DEFAULT 0,
  dead_lettered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at        TIMESTAMPTZ,
  resolved_by        TEXT
);

CREATE INDEX IF NOT EXISTS dlq_aggregate_id_idx ON dlq_events (aggregate_id);
CREATE INDEX IF NOT EXISTS dlq_resolved_at_idx  ON dlq_events (resolved_at)
  WHERE resolved_at IS NULL;

-- ─── Idempotency Keys ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key        TEXT PRIMARY KEY,
  result     JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idempotency_expires_at_idx ON idempotency_keys (expires_at);

-- ─── Consumer Execution Logs ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consumer_execution_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id     UUID        NOT NULL REFERENCES events(id),
  event_type   TEXT        NOT NULL,
  consumer     TEXT        NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status       TEXT        NOT NULL DEFAULT 'RETRYING',
  error        TEXT,
  latency_ms   INTEGER
);

CREATE INDEX IF NOT EXISTS cel_event_id_idx  ON consumer_execution_logs (event_id);
CREATE INDEX IF NOT EXISTS cel_consumer_idx  ON consumer_execution_logs (consumer);

-- ─── Chaos Config ────────────────────────────────────────────────────────────
-- Single-row table for global chaos state (simpler than a key-value store)
CREATE TABLE IF NOT EXISTS chaos_config (
  id                    INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payment_failure_rate  NUMERIC(3,2) NOT NULL DEFAULT 0,
  inventory_failure_rate NUMERIC(3,2) NOT NULL DEFAULT 0,
  processing_delay_ms   INTEGER      NOT NULL DEFAULT 0,
  duplicate_event_rate  NUMERIC(3,2) NOT NULL DEFAULT 0,
  consumer_timeout_rate NUMERIC(3,2) NOT NULL DEFAULT 0,
  poison_message_enabled BOOLEAN     NOT NULL DEFAULT FALSE
);

INSERT INTO chaos_config DEFAULT VALUES ON CONFLICT DO NOTHING;

-- ─── Cleanup function (useful for demo resets) ─────────────────────────────────
CREATE OR REPLACE FUNCTION reset_orderflow()
RETURNS void AS $$
BEGIN
  DELETE FROM consumer_execution_logs;
  DELETE FROM dlq_events;
  DELETE FROM projections;
  DELETE FROM events;
  DELETE FROM order_items;
  DELETE FROM orders;
  DELETE FROM idempotency_keys;
  UPDATE chaos_config SET
    payment_failure_rate = 0,
    inventory_failure_rate = 0,
    processing_delay_ms = 0,
    duplicate_event_rate = 0,
    consumer_timeout_rate = 0,
    poison_message_enabled = FALSE;
END;
$$ LANGUAGE plpgsql;
