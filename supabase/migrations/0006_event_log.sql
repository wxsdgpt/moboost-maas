-- 0006_event_log.sql
--
-- Lightweight event log for demo analytics.
-- Fire-and-forget writes from src/lib/eventLog.ts.
-- Read path is manual (SQL queries / dashboard) — no API route yet.

create table if not exists public.event_log (
  id         uuid primary key default gen_random_uuid(),
  event      text not null,
  user_id    uuid references public.users(id),
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists event_log_event_idx
  on public.event_log (event, created_at desc);

create index if not exists event_log_user_idx
  on public.event_log (user_id, created_at desc)
  where user_id is not null;
