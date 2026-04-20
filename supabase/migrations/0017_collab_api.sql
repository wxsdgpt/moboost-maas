-- ============================================================================
-- 0017 — Collaborator API: localization workflow + bearer token auth.
--
-- Two new tables:
--
-- 1) collab_tokens — bearer tokens issued from the admin UI for external
--    collaborators (e.g. localization vendors). Token plaintext is shown
--    once on creation; storage is sha256(token) so leaks of this table do
--    not leak usable credentials. Tokens can be revoked (revoked_at) and
--    optionally scoped (scopes jsonb — reserved for future per-route ACL).
--
-- 2) asset_localizations — per-locale rows that hang off either an asset
--    (project_assets) OR a landing_page (polymorphic — exactly one parent
--    via check constraint). Each row carries the locale code + the
--    localized URL/HTML and metadata. Submit-equals-adopt: there is no
--    review/approval column. Newest rows win at fetch time; the original
--    row stays untouched.
-- ============================================================================

-- ─── collab_tokens ─────────────────────────────────────────────────────────
create table if not exists public.collab_tokens (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                       -- human label, e.g. "Acme Loc Team"
  token_hash   text not null unique,                -- sha256 hex of the bearer token
  prefix       text not null,                       -- first 8 chars of plaintext, for UI display
  scopes       jsonb not null default '[]'::jsonb,  -- reserved for future ACL
  created_at   timestamptz not null default now(),
  created_by   text,                                -- admin username
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index if not exists collab_tokens_active_idx
  on public.collab_tokens (token_hash) where revoked_at is null;

-- ─── asset_localizations ──────────────────────────────────────────────────
create table if not exists public.asset_localizations (
  id              uuid primary key default gen_random_uuid(),
  asset_id        uuid references public.project_assets(id) on delete cascade,
  landing_page_id uuid references public.landing_pages(id) on delete cascade,
  locale          text not null,                    -- BCP-47 e.g. 'es-MX', 'pt-BR'
  url             text,                             -- for image/video localizations
  html            text,                             -- for landing-page localizations
  metadata        jsonb not null default '{}'::jsonb,
  submitted_by    uuid references public.collab_tokens(id) on delete set null,
  created_at      timestamptz not null default now(),

  -- Polymorphic guard: exactly one parent must be set.
  constraint asset_localizations_parent_chk
    check (
      (asset_id is not null and landing_page_id is null)
      or
      (asset_id is null and landing_page_id is not null)
    )
);

create index if not exists asset_localizations_asset_idx
  on public.asset_localizations (asset_id, locale, created_at desc);

create index if not exists asset_localizations_landing_idx
  on public.asset_localizations (landing_page_id, locale, created_at desc);
