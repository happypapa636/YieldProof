-- YieldProof schema. Idempotent; every object lives in the `yieldproof` schema
-- (the Neon database is shared with other apps — never touch `public`).
CREATE SCHEMA IF NOT EXISTS yieldproof;

-- SIWE: single-use, expiring nonces issued by the server.
CREATE TABLE IF NOT EXISTS yieldproof.siwe_nonces (
  nonce       text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX IF NOT EXISTS siwe_nonces_expires_idx ON yieldproof.siwe_nonces (expires_at);

CREATE TABLE IF NOT EXISTS yieldproof.users (
  address        text PRIMARY KEY CHECK (address ~ '^0x[0-9a-f]{40}$'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS yieldproof.watchlist (
  id              bigserial PRIMARY KEY,
  address         text NOT NULL REFERENCES yieldproof.users(address) ON DELETE CASCADE,
  opportunity_id  text NOT NULL CHECK (char_length(opportunity_id) BETWEEN 1 AND 80),
  note            text CHECK (note IS NULL OR char_length(note) <= 280),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (address, opportunity_id)
);

CREATE TABLE IF NOT EXISTS yieldproof.saved_comparisons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address     text NOT NULL REFERENCES yieldproof.users(address) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  params      jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_comparisons_address_idx ON yieldproof.saved_comparisons (address, created_at DESC);

CREATE TABLE IF NOT EXISTS yieldproof.user_settings (
  address     text PRIMARY KEY REFERENCES yieldproof.users(address) ON DELETE CASCADE,
  settings    jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Alerts are evaluated by the daily cron AND when the owner opens the app.
CREATE TABLE IF NOT EXISTS yieldproof.alerts (
  id                 bigserial PRIMARY KEY,
  address            text NOT NULL REFERENCES yieldproof.users(address) ON DELETE CASCADE,
  opportunity_id     text NOT NULL,
  kind               text NOT NULL CHECK (kind IN ('yield_below','incentive_below','liquidity_below','borrow_above','stale_data','param_change','net_negative')),
  threshold          numeric,
  enabled            boolean NOT NULL DEFAULT true,
  state              text NOT NULL DEFAULT 'unknown' CHECK (state IN ('unknown','ok','triggered','unavailable')),
  last_value         numeric,
  last_checked_at    timestamptz,
  last_triggered_at  timestamptz,
  baseline           jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (address, opportunity_id, kind)
);

CREATE TABLE IF NOT EXISTS yieldproof.notifications (
  id              bigserial PRIMARY KEY,
  address         text NOT NULL REFERENCES yieldproof.users(address) ON DELETE CASCADE,
  alert_id        bigint REFERENCES yieldproof.alerts(id) ON DELETE SET NULL,
  opportunity_id  text,
  message         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  read_at         timestamptz
);
CREATE INDEX IF NOT EXISTS notifications_address_idx ON yieldproof.notifications (address, created_at DESC);

-- YieldProof's own history: one row per opportunity, metric and UTC day (latest value wins).
CREATE TABLE IF NOT EXISTS yieldproof.metric_snapshots (
  id              bigserial PRIMARY KEY,
  snapshot_day    date NOT NULL,
  taken_at        timestamptz NOT NULL DEFAULT now(),
  opportunity_id  text NOT NULL,
  metric          text NOT NULL,
  value           numeric,
  source          text NOT NULL,
  source_type     text NOT NULL,
  observed_at     timestamptz,
  UNIQUE (opportunity_id, metric, snapshot_day)
);
CREATE INDEX IF NOT EXISTS metric_snapshots_lookup_idx ON yieldproof.metric_snapshots (opportunity_id, metric, snapshot_day);

-- Expensive on-chain computations (log scans), cached with their window.
CREATE TABLE IF NOT EXISTS yieldproof.fee_windows (
  pool_id      text NOT NULL,
  window_days  integer NOT NULL,
  computed_at  timestamptz NOT NULL,
  data         jsonb NOT NULL,
  PRIMARY KEY (pool_id, window_days)
);

CREATE TABLE IF NOT EXISTS yieldproof.cron_runs (
  id           bigserial PRIMARY KEY,
  job          text NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','partial','failed')),
  details      jsonb
);
CREATE INDEX IF NOT EXISTS cron_runs_job_idx ON yieldproof.cron_runs (job, started_at DESC);
