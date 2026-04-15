-- 0004_market_intel.sql
--
-- Market intel snapshots keyed by (vertical, source).  Populated by a
-- cron-driven sync runner in src/lib/marketIntel/syncRunner.ts — NOT
-- by interactive user requests.  Rows are shared across all users:
-- Sports Betting intel is the same for every tenant.
--
-- Design notes:
-- - One row per (vertical, source).  The sync upserts in place so we
--   always have "latest snapshot" semantics without a history table.
-- - If we need history later, add a market_intel_history table and
--   copy rows on update.  Not needed for Phase 1.
-- - `payload jsonb` holds the provider-shaped VerticalIntel.  Schema
--   is enforced in TypeScript at the edges (src/lib/marketIntel/types.ts),
--   not in the DB.
-- - `freshness_score` is a 0-1 float computed at sync time based on
--   payload coverage so the read path can degrade gracefully.

create table if not exists public.market_intel (
  id              uuid primary key default gen_random_uuid(),
  vertical        text not null,
  source          text not null,
  snapshot_date   timestamptz not null default now(),
  payload         jsonb not null,
  freshness_score real not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (vertical, source)
);

create index if not exists market_intel_vertical_idx
  on public.market_intel (vertical);

create index if not exists market_intel_snapshot_date_idx
  on public.market_intel (snapshot_date desc);
