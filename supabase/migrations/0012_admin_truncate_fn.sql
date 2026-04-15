-- Admin utility: TRUNCATE all user-related tables via a single RPC call.
-- This bypasses RLS entirely because it runs as the DB owner (postgres).
-- Only callable from server-side with service_role key.

create or replace function public.admin_truncate_all_tables()
returns jsonb
language plpgsql
security definer  -- runs as the function owner (postgres), bypasses RLS
as $$
begin
  -- Disable triggers temporarily to avoid FK constraint issues
  set session_replication_role = 'replica';

  truncate public.event_log cascade;
  truncate public.agent_execution_logs cascade;
  truncate public.landing_pages cascade;
  truncate public.credit_ledger cascade;
  truncate public.reports cascade;
  truncate public.products cascade;
  truncate public.subscriptions cascade;
  truncate public.market_intel cascade;
  truncate public.users cascade;

  -- Re-enable triggers
  set session_replication_role = 'origin';

  return jsonb_build_object(
    'success', true,
    'message', 'All user-related tables truncated'
  );
end;
$$;
