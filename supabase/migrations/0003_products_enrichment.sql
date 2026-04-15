-- ============================================================
-- 0003 — product enrichment columns
-- Stores the output of the URL scraping + LLM extraction pipeline
-- kicked off after a user completes onboarding.
--
-- Layout:
--   enrichment    jsonb   structured product picture
--                         { raw, extracted, enriched, source }
--                         see src/lib/productEnrichment.ts for shape
--   enriched_at   timestamptz  last successful enrichment run
--   content_hash  text    sha256 of the raw HTML; used to skip
--                         re-enrichment when the source page hasn't
--                         changed since last run
--   enrichment_status text one of: 'pending' | 'running' | 'ready' | 'failed'
--   enrichment_error  text last error message on failure, else null
--
-- Run this in the Supabase SQL Editor after 0002_user_onboarding.sql.
-- ============================================================

alter table public.products
  add column if not exists enrichment jsonb,
  add column if not exists enriched_at timestamptz,
  add column if not exists content_hash text,
  add column if not exists enrichment_status text
    not null default 'pending',
  add column if not exists enrichment_error text;

-- Helps the homepage / dashboard show "enrichment ready" badges
-- without scanning every product.
create index if not exists products_enrichment_status_idx
  on public.products (enrichment_status);
