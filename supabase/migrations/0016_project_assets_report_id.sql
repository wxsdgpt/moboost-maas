-- ============================================================================
-- 0016 — Tie generated creatives (image/video) back to the report that
-- triggered them.
--
-- Why: brief/execute generates per-audience-group creatives + landing pages.
-- landing_pages already has report_id (since 0005), so the report-detail
-- view can list its own landing pages. project_assets — where image/video
-- creatives live — only had project_id, so we couldn't surface "the
-- creatives generated *for this report*" without over-including assets
-- from other reports under the same project.
--
-- This migration adds report_id (nullable, ON DELETE SET NULL) and an
-- index for the report→assets reverse-chrono lookup. Existing rows stay
-- with NULL report_id (unknowable historically) — they remain visible at
-- the project level but not anchored to a specific report.
-- ============================================================================

alter table public.project_assets
  add column if not exists report_id uuid references public.reports(id) on delete set null;

create index if not exists project_assets_report_id_idx
  on public.project_assets (report_id, created_at desc);

-- Also add audience metadata fields used by the report-level view to label
-- which audience group each creative was generated for. Stored as plain
-- columns (not metadata jsonb) so they can be filtered/indexed if needed
-- and so the API layer doesn't need to dig into a free-form blob.
alter table public.project_assets
  add column if not exists audience_tag text;

alter table public.project_assets
  add column if not exists region text;
