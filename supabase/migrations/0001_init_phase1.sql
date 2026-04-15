-- ============================================================
-- Phase 1 initial schema — anonymous-first funnel + credit ledger
-- Run this in Supabase SQL Editor (Database → SQL Editor → New query)
-- ============================================================

-- 1. users ──────────────────────────────────────────────────
-- Bridges Clerk userId ↔ internal row.  Lazy-created on first
-- authenticated request via src/lib/auth.ts.
create table if not exists public.users (
  id             uuid primary key default gen_random_uuid(),
  clerk_user_id  text unique not null,
  email          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists users_clerk_user_id_idx on public.users (clerk_user_id);

-- 2. products ───────────────────────────────────────────────
-- A product is one "thing the marketer wants to promote".
-- Multiple reports can be generated against the same product.
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        text not null,
  url         text,
  description text,
  category    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists products_user_id_idx on public.products (user_id);

-- 3. reports ────────────────────────────────────────────────
-- A generated artifact (lite/full/competitive-brief/etc.).
-- `kind` drives the credit consumption rate.
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  kind        text not null,              -- 'lite' | 'full' | 'competitive-brief' | ...
  status      text not null default 'pending', -- 'pending' | 'running' | 'done' | 'failed'
  input       jsonb,
  output      jsonb,
  credits_charged int not null default 0, -- resolved at commit time
  reservation_id uuid,                    -- FK into credit_ledger (soft — no constraint)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists reports_user_id_idx on public.reports (user_id);
create index if not exists reports_product_id_idx on public.reports (product_id);
create index if not exists reports_status_idx on public.reports (status);

-- 4. credit_ledger ──────────────────────────────────────────
-- Append-only ledger.  Balance = SUM(amount) over non-expired,
-- non-rolled-back rows.  See src/lib/creditLedger.ts for logic.
--
-- entry_type:
--   'grant_subscription'   +N, expires at period_end
--   'grant_bonus'          +N, never expires (e.g. 50-credit demo)
--   'grant_topup'          +N, never expires (paid top-up)
--   'reserve'              −N, status='reserved' until commit/rollback
--   'commit'               paired with a reserve — flips reserve to 'committed'
--   'rollback'             paired with a reserve — flips reserve to 'rolled_back'
--
-- For simplicity in phase 1 we store reserve as a negative row
-- with status, and commit/rollback update that row's status.
-- 'commit' / 'rollback' entry_types themselves are sentinel rows
-- so we keep the append-only invariant.
create table if not exists public.credit_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  entry_type      text not null,
  amount          int  not null,          -- signed: +grant, −reserve
  status          text not null default 'active', -- 'active' | 'reserved' | 'committed' | 'rolled_back' | 'expired'
  bucket          text not null,          -- 'subscription' | 'bonus' | 'topup'
  expires_at      timestamptz,            -- null = never expires
  ref_report_id   uuid references public.reports(id) on delete set null,
  ref_reservation uuid,                   -- for commit/rollback rows, points to the original reserve
  note            text,
  created_at      timestamptz not null default now()
);
create index if not exists credit_ledger_user_id_idx on public.credit_ledger (user_id);
create index if not exists credit_ledger_user_active_idx
  on public.credit_ledger (user_id, status, expires_at);
create index if not exists credit_ledger_reservation_idx
  on public.credit_ledger (ref_reservation);

-- 5. subscriptions ──────────────────────────────────────────
-- Mirrors LemonSqueezy subscription state.  One active row per user.
create table if not exists public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users(id) on delete cascade,
  tier                 text not null,     -- 'free' | 'pro' | 'max' | 'enterprise'
  status               text not null,     -- 'active' | 'past_due' | 'cancelled' | 'expired'
  lemonsqueezy_sub_id  text unique,
  lemonsqueezy_customer_id text,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  monthly_credit_grant int not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);

-- ============================================================
-- updated_at trigger (shared)
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'users_set_updated_at') then
    create trigger users_set_updated_at before update on public.users
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'products_set_updated_at') then
    create trigger products_set_updated_at before update on public.products
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'reports_set_updated_at') then
    create trigger reports_set_updated_at before update on public.reports
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'subscriptions_set_updated_at') then
    create trigger subscriptions_set_updated_at before update on public.subscriptions
      for each row execute function public.set_updated_at();
  end if;
end$$;

-- ============================================================
-- RLS — locked down by default.
-- Phase 1 we access everything via service_role (server-only).
-- When we add client-side reads we'll grant per-row policies.
-- ============================================================
alter table public.users          enable row level security;
alter table public.products       enable row level security;
alter table public.reports        enable row level security;
alter table public.credit_ledger  enable row level security;
alter table public.subscriptions  enable row level security;

-- service_role bypasses RLS automatically; no policies needed yet.
