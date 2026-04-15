-- ============================================================
-- 0002 — onboarding fields on public.users
-- Adds the columns the /onboarding flow writes back into:
--   - product_info  jsonb     captured from the multi-step form
--   - onboarded_at  timestamp set when the user finishes the flow.
--                              Used as the idempotency gate so a
--                              returning user is never re-onboarded.
-- Run this in the Supabase SQL Editor after 0001_init_phase1.sql.
-- ============================================================

alter table public.users
  add column if not exists product_info jsonb,
  add column if not exists onboarded_at timestamptz;

-- Partial index — most queries are "has this user finished onboarding?"
-- which is just a NOT NULL check; a partial index keeps it cheap on the
-- (much larger) post-launch table.
create index if not exists users_onboarded_at_idx
  on public.users (onboarded_at)
  where onboarded_at is not null;
