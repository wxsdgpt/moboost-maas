-- 0015_backfill_orphan_projects.sql
--
-- Backfill: every report / landing_page row that was generated before the
-- "always stamp project_id" change still has project_id = NULL. This
-- migration links each orphan to a project owned by the same user and
-- ideally tied to the same product, auto-creating one if none exists.
--
-- Strategy:
--   1. For each (user_id, product_id) that has orphans but no project,
--      create a single 'auto' project with source='backfill'.
--   2. UPDATE all orphaned reports/landing_pages to point at the
--      newest project for (user_id, product_id).
--
-- Idempotent: re-running is a no-op once project_id is non-null on
-- every row.

BEGIN;

-- 1. Auto-create projects for (user, product) pairs that have orphans
--    but no existing project.
INSERT INTO public.projects (user_id, product_id, name, source, metadata)
SELECT DISTINCT
  o.user_id,
  o.product_id,
  COALESCE(p.name, 'Untitled'),
  'auto',
  jsonb_build_object('auto_created', true, 'reason', 'backfill_orphans')
FROM (
  SELECT user_id, product_id FROM public.reports
    WHERE project_id IS NULL AND product_id IS NOT NULL
  UNION
  SELECT user_id, product_id FROM public.landing_pages
    WHERE project_id IS NULL AND product_id IS NOT NULL
) o
JOIN public.products p ON p.id = o.product_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.projects pj
  WHERE pj.user_id = o.user_id AND pj.product_id = o.product_id
);

-- 2. Link orphan reports to the newest project for (user, product).
UPDATE public.reports r
SET project_id = pj.id
FROM (
  SELECT DISTINCT ON (user_id, product_id)
    id, user_id, product_id
  FROM public.projects
  ORDER BY user_id, product_id, created_at DESC
) pj
WHERE r.project_id IS NULL
  AND r.user_id = pj.user_id
  AND r.product_id = pj.product_id;

-- 3. Same for landing_pages.
UPDATE public.landing_pages l
SET project_id = pj.id
FROM (
  SELECT DISTINCT ON (user_id, product_id)
    id, user_id, product_id
  FROM public.projects
  ORDER BY user_id, product_id, created_at DESC
) pj
WHERE l.project_id IS NULL
  AND l.user_id = pj.user_id
  AND l.product_id = pj.product_id;

COMMIT;
