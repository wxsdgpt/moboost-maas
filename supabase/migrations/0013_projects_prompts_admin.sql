-- Migration: 0013_projects_prompts_admin.sql
-- Description: Adds projects, prompt_logs, admin_config tables and related structures
-- Tables added: projects, prompt_logs, admin_config, project_assets, project_conversations
-- Tables modified: reports, landing_pages

-- ============================================================================
-- 1. PROJECTS TABLE
-- ============================================================================
-- Groups all work for one marketing campaign/product
-- Stores: reports, assets, landing pages, and conversation history

create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  name         text not null,
  description  text,
  status       text not null default 'active',  -- 'active' | 'archived'
  source       text not null default 'manual',  -- 'onboarding' | 'homepage' | 'manual'
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Indexes for common queries
create index if not exists projects_user_id_idx on public.projects (user_id, created_at desc);
create index if not exists projects_product_id_idx on public.projects (product_id);


-- ============================================================================
-- 2. PROMPT_LOGS TABLE
-- ============================================================================
-- Records every LLM API call for observability
-- Stores: full request, response, metrics, and status

create table if not exists public.prompt_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.users(id) on delete set null,
  project_id     uuid references public.projects(id) on delete set null,

  -- What triggered this call
  caller         text not null,           -- e.g. 'reportGenerator', 'productEnrichment', 'evaluateAsset', 'intentDetector', 'briefAgent'
  action         text,                    -- e.g. 'generate_section', 'detect_intent', 'clarify'

  -- Request details
  model          text not null,           -- e.g. 'anthropic/claude-sonnet-4-6'
  system_prompt  text,
  user_prompt    text not null,
  full_messages  jsonb,                   -- full messages array for multi-turn
  request_params jsonb,                   -- temperature, max_tokens, etc.

  -- Admin context that was injected
  admin_context  text,

  -- Response details
  response_text  text,
  response_json  jsonb,                   -- parsed JSON if applicable

  -- Metrics
  input_tokens   int,
  output_tokens  int,
  total_tokens   int,
  latency_ms     int,
  cost_usd       numeric(10,6),

  -- Status
  status         text not null default 'success', -- 'success' | 'error' | 'timeout'
  error_message  text,
  created_at     timestamptz not null default now()
);

-- Indexes for common queries
create index if not exists prompt_logs_user_id_idx on public.prompt_logs (user_id, created_at desc);
create index if not exists prompt_logs_project_id_idx on public.prompt_logs (project_id);
create index if not exists prompt_logs_caller_idx on public.prompt_logs (caller, created_at desc);
create index if not exists prompt_logs_model_idx on public.prompt_logs (model, created_at desc);


-- ============================================================================
-- 3. ADMIN_CONFIG TABLE
-- ============================================================================
-- Key-value store for admin-configurable settings
-- Most important: unified system prompt context injected into all LLM calls

create table if not exists public.admin_config (
  key            text primary key,
  value          jsonb not null,
  description    text,
  updated_by     text,  -- admin email or clerk_user_id
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);


-- ============================================================================
-- 3a. INSERT DEFAULT ADMIN CONFIG ROWS
-- ============================================================================

insert into public.admin_config (key, value, description) values
  ('system_context', '"You are Moboost AI, a marketing intelligence platform for the iGaming industry. Always provide actionable, data-driven insights."'::jsonb, 'Unified system prompt context injected into all LLM calls'),
  ('default_model', '"anthropic/claude-sonnet-4-6"'::jsonb, 'Default LLM model for text generation'),
  ('image_model', '"google/gemini-3-pro-image-preview"'::jsonb, 'Default model for image generation'),
  ('video_model', '"google/veo-3.1"'::jsonb, 'Default model for video generation'),
  ('eval_model', '"anthropic/claude-sonnet-4-6"'::jsonb, 'Default model for asset evaluation'),
  ('intent_detection_prompt', '"Analyze the user input and determine the intent. Possible intents: intel (competitive intelligence/report), asset (generate image or video), landing (generate landing page), unknown. If the user provides a URL, extract it. If they mention a competitor or product name without URL, suggest searching for it."'::jsonb, 'System prompt for intent detection'),
  ('onboarding_variant', '"form"'::jsonb, 'A/B test variant for onboarding: form | chat | hybrid')
on conflict (key) do nothing;


-- ============================================================================
-- 4. MODIFY EXISTING TABLES - ADD PROJECT_ID
-- ============================================================================

-- Add project_id to reports table
alter table public.reports add column if not exists project_id uuid references public.projects(id) on delete set null;
create index if not exists reports_project_id_idx2 on public.reports (project_id);

-- Add project_id to landing_pages table
alter table public.landing_pages add column if not exists project_id uuid references public.projects(id) on delete set null;
create index if not exists landing_pages_project_id_idx on public.landing_pages (project_id);


-- ============================================================================
-- 5. PROJECT_ASSETS TABLE
-- ============================================================================
-- Stores generated images/videos associated with a project
-- Tracks generation status, metadata, and evaluation scores

create table if not exists public.project_assets (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  type         text not null,            -- 'image' | 'video'
  prompt       text,
  url          text,                     -- stored URL or path
  thumbnail    text,                     -- thumbnail URL for videos
  model        text,                     -- which model generated it
  dimensions   jsonb,                    -- {width, height, duration}
  evaluation   jsonb,                    -- D1-D4 scores
  metadata     jsonb not null default '{}'::jsonb,
  status       text not null default 'pending', -- 'pending' | 'generating' | 'done' | 'failed'
  created_at   timestamptz not null default now()
);

-- Indexes for common queries
create index if not exists project_assets_project_id_idx on public.project_assets (project_id, created_at desc);
create index if not exists project_assets_user_id_idx on public.project_assets (user_id);


-- ============================================================================
-- 6. PROJECT_CONVERSATIONS TABLE
-- ============================================================================
-- Stores conversation history for the intelligent collector
-- Tracks role, content, and detected intent

create table if not exists public.project_conversations (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references public.projects(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  role         text not null,            -- 'user' | 'assistant' | 'system'
  content      text not null,
  intent       text,                     -- detected intent for this message
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- Indexes for common queries
create index if not exists project_conversations_project_id_idx on public.project_conversations (project_id, created_at asc);


-- ============================================================================
-- 7. ENABLE ROW LEVEL SECURITY
-- ============================================================================

alter table public.projects enable row level security;
alter table public.prompt_logs enable row level security;
alter table public.admin_config enable row level security;
alter table public.project_assets enable row level security;
alter table public.project_conversations enable row level security;


-- ============================================================================
-- 8. CREATE UPDATED_AT TRIGGERS
-- ============================================================================

do $$
begin
  -- Create trigger for projects table if it doesn't exist
  if not exists (select 1 from pg_trigger where tgname = 'projects_set_updated_at') then
    create trigger projects_set_updated_at before update on public.projects
      for each row execute function public.set_updated_at();
  end if;

  -- Create trigger for admin_config table if it doesn't exist
  if not exists (select 1 from pg_trigger where tgname = 'admin_config_set_updated_at') then
    create trigger admin_config_set_updated_at before update on public.admin_config
      for each row execute function public.set_updated_at();
  end if;
end$$;
