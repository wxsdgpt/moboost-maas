-- ============================================================
-- Moboost MAAS: Reset All User + Associated Data
--
-- Run this in Supabase Dashboard > SQL Editor
--
-- This will delete:
--   1. users (and cascade to: products, reports, credit_ledger, subscriptions, landing_pages)
--   2. event_log (user activity logs)
--   3. agent_execution_logs (agent run logs)
--
-- This will NOT delete:
--   - market_intel (competitive intelligence, not user-specific)
--   - industry_knowledge (shared knowledge base)
--   - evolution_* tables (system evolution data)
--   - exploration_* tables (system exploration data)
-- ============================================================

BEGIN;

-- Step 1: Clear tables with optional user_id (no cascade from users)
DELETE FROM public.event_log;
DELETE FROM public.agent_execution_logs;

-- Step 2: Delete all users (CASCADE will auto-delete from:
--   products, reports, credit_ledger, subscriptions, landing_pages)
DELETE FROM public.users;

COMMIT;

-- Verify: all should return 0
SELECT 'users' AS table_name, count(*) FROM public.users
UNION ALL SELECT 'products', count(*) FROM public.products
UNION ALL SELECT 'reports', count(*) FROM public.reports
UNION ALL SELECT 'credit_ledger', count(*) FROM public.credit_ledger
UNION ALL SELECT 'subscriptions', count(*) FROM public.subscriptions
UNION ALL SELECT 'landing_pages', count(*) FROM public.landing_pages
UNION ALL SELECT 'event_log', count(*) FROM public.event_log
UNION ALL SELECT 'agent_execution_logs', count(*) FROM public.agent_execution_logs;
