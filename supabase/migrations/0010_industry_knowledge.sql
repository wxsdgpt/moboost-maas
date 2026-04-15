-- ================================================================
-- 0010: Industry Knowledge Base
-- ================================================================
-- Stores intelligence collected by the autonomous exploration system.
-- Feeds the 4 proactive evolution mechanisms:
--   1. Self-Test (industry benchmarks)
--   2. Cross-Eval (competitor capabilities)
--   3. Capability Audit (feature gap analysis)
--   4. Domain Gap Analysis (market trend awareness)
--
-- Collection sources (layered):
--   L1: LLM with web search (Perplexity via OpenRouter)
--   L2: Custom crawlers (Playwright/Cheerio)
--   L3: Third-party APIs (Similarweb, Ahrefs, etc.)
--   L4: Local agents (Claude Code, etc.)
-- ================================================================

-- ─── Main knowledge entries table ────────────────────────────────
create table if not exists public.industry_knowledge (
  id            uuid primary key default gen_random_uuid(),

  -- Classification
  category      text not null,          -- 'competitor', 'trend', 'regulation', 'best_practice', 'technology', 'market_data'
  vertical      text,                   -- iGaming vertical: 'Sports Betting', 'Casino', etc. NULL = cross-vertical
  region        text,                   -- ISO geo code or region name, NULL = global
  tags          text[] default '{}',    -- free-form tags for search

  -- Content
  title         text not null,
  summary       text not null,          -- LLM-structured summary (≤500 chars)
  full_content  text,                   -- raw extracted content
  structured    jsonb default '{}',     -- LLM-structured data (varies by category)

  -- Source tracking
  source_type   text not null,          -- 'perplexity', 'crawler', 'api', 'manual', 'chrome_mcp'
  source_url    text,                   -- original URL if applicable
  source_query  text,                   -- the search query that found this

  -- Quality & freshness
  confidence    real default 0.5,       -- 0-1, LLM-assessed confidence
  relevance     real default 0.5,       -- 0-1, relevance to iGaming MAAS
  freshness     real default 1.0,       -- 0-1, decays over time

  -- Lifecycle
  status        text default 'active',  -- 'active', 'stale', 'archived', 'superseded'
  superseded_by uuid references public.industry_knowledge(id),
  expires_at    timestamptz,            -- auto-stale date

  -- Audit
  collected_at  timestamptz default now(),
  updated_at    timestamptz default now(),
  collected_by  text default 'system'   -- 'pcec', 'manual', 'scheduled', etc.
);

-- Indexes for common query patterns
create index if not exists idx_ik_category    on public.industry_knowledge(category);
create index if not exists idx_ik_vertical    on public.industry_knowledge(vertical);
create index if not exists idx_ik_status      on public.industry_knowledge(status);
create index if not exists idx_ik_tags        on public.industry_knowledge using gin(tags);
create index if not exists idx_ik_collected   on public.industry_knowledge(collected_at desc);
create index if not exists idx_ik_relevance   on public.industry_knowledge(relevance desc);

-- ─── Exploration tasks table ─────────────────────────────────────
-- Tracks what the system is exploring and has explored.
create table if not exists public.exploration_tasks (
  id            uuid primary key default gen_random_uuid(),

  -- Task definition
  query         text not null,          -- search query or URL to explore
  category      text not null,          -- target category
  vertical      text,                   -- target vertical
  priority      int default 5,          -- 1-10, higher = more urgent

  -- Execution
  status        text default 'pending', -- 'pending', 'running', 'completed', 'failed', 'skipped'
  collector     text,                   -- which collector handled it
  result_count  int default 0,          -- how many knowledge entries produced
  error         text,                   -- error message if failed

  -- Scheduling
  triggered_by  text default 'system',  -- 'pcec', 'manual', 'scheduled', 'gap_analysis'
  run_at        timestamptz,            -- when it was executed
  created_at    timestamptz default now(),

  -- Dedup
  query_hash    text generated always as (md5(lower(trim(query)))) stored
);

create index if not exists idx_et_status   on public.exploration_tasks(status);
create index if not exists idx_et_hash     on public.exploration_tasks(query_hash);
create index if not exists idx_et_priority on public.exploration_tasks(priority desc);

-- ─── Exploration schedule (what topics to regularly explore) ─────
create table if not exists public.exploration_schedule (
  id            uuid primary key default gen_random_uuid(),

  -- What to explore
  topic         text not null,          -- e.g. 'iGaming advertising trends 2026'
  category      text not null,
  vertical      text,

  -- Schedule
  cron_expr     text default '0 3 * * 1',  -- default: Monday 3am
  enabled       boolean default true,
  last_run_at   timestamptz,
  next_run_at   timestamptz,

  created_at    timestamptz default now()
);

-- ─── Seed default exploration topics for iGaming MAAS ────────────
insert into public.exploration_schedule (topic, category, vertical) values
  ('iGaming digital marketing trends 2026',                'trend',         null),
  ('sports betting advertising regulations update',        'regulation',    'Sports Betting'),
  ('casino online marketing best practices',               'best_practice', 'Casino'),
  ('igaming creative ad formats performance',              'best_practice', null),
  ('mobile gaming user acquisition strategies',            'trend',         null),
  ('programmatic advertising igaming compliance',          'regulation',    null),
  ('esports sponsorship marketing ROI',                    'market_data',   'Esports'),
  ('live dealer casino promotion strategies',              'best_practice', 'Live Dealer'),
  ('crash games viral marketing techniques',               'trend',         'Crash Games'),
  ('igaming competitor analysis top operators',            'competitor',    null),
  ('AI generated creative ads gaming industry',            'technology',    null),
  ('slots game marketing visual trends',                   'trend',         'Slots')
on conflict do nothing;
