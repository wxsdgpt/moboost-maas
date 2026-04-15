-- 0005_landing_pages.sql
--
-- Stores AI-generated landing pages.  Each row is one generation
-- attempt: template chosen, AI-filled slot values, and the final
-- standalone HTML.
--
-- Linked to a product (required) and optionally to a report whose
-- summary was used to inform the generation.

create table if not exists public.landing_pages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id),
  product_id   uuid not null references public.products(id),
  template_id  text not null,
  report_id    uuid references public.reports(id),
  filled_slots jsonb not null default '[]'::jsonb,
  html         text not null default '',
  model        text,
  status       text not null default 'done',
  created_at   timestamptz not null default now()
);

create index if not exists landing_pages_user_idx
  on public.landing_pages (user_id, created_at desc);

create index if not exists landing_pages_product_idx
  on public.landing_pages (product_id);
