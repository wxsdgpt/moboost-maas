-- Fix admin_truncate_all_tables():
--   1. Remove session_replication_role (superuser-only, denied on Supabase)
--   2. Use TRUNCATE ... CASCADE instead (handles FK constraints)
--   3. Add new tables from 0013 migration (projects, prompt_logs, etc.)
--   4. Preserve admin_config rows (they contain system configuration)

create or replace function public.admin_truncate_all_tables()
returns jsonb
language plpgsql
security definer  -- runs as function owner, bypasses RLS
as $$
begin
  -- Child tables first, then parent tables. CASCADE handles remaining FKs.
  truncate public.prompt_logs cascade;
  truncate public.project_conversations cascade;
  truncate public.project_assets cascade;
  truncate public.event_log cascade;
  truncate public.agent_execution_logs cascade;
  truncate public.landing_pages cascade;
  truncate public.credit_ledger cascade;
  truncate public.reports cascade;
  truncate public.projects cascade;
  truncate public.products cascade;
  truncate public.subscriptions cascade;
  truncate public.market_intel cascade;
  truncate public.users cascade;
  -- NOTE: admin_config is NOT truncated — it holds system configuration

  return jsonb_build_object(
    'success', true,
    'message', 'All user-related tables truncated (admin_config preserved)'
  );
end;
$$;
