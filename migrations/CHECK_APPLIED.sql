-- ============================================================
-- WHICH MIGRATIONS HAVE ACTUALLY BEEN RUN?
--
-- These migrations are applied by hand in the Supabase SQL editor and nothing
-- records that they ran — there is no ledger table. Worse, every one of them is
-- written to be safe to re-run (IF NOT EXISTS, DROP POLICY IF EXISTS), so
-- running one a second time succeeds silently and tells you nothing either.
--
-- So the only honest check is to look for what each migration CREATES. This
-- query does that: one row per migration, against the live schema.
--
-- Paste the whole thing into the Supabase SQL editor and run it. Read-only —
-- it creates nothing and changes nothing, so it is safe to run any time.
--
-- Re-running a migration that shows as applied is harmless. The one to be
-- careful with is COLVY_V210_RLS_PHASE2_CUSTOMER_DATA, which needs the
-- application deployed first — see the warning in its own header.
-- ============================================================

SELECT
  t.migration,
  CASE WHEN t.applied THEN 'applied' ELSE 'NOT RUN' END AS status,
  t.looks_for
FROM (VALUES

  -- Tasks. The mobile Tasks screen degrades gracefully without these: it falls
  -- back to a lean insert, so a missing one costs a feature, not a crash.
  ('COLVY_V200_TASK_ASSIGNMENT',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'conversation_tasks'
              AND column_name = 'assigned_to_id'),
   'conversation_tasks.assigned_to_id'),

  ('COLVY_V203_TASK_BOARD',
   to_regclass('public.task_comments') IS NOT NULL,
   'table task_comments'),

  ('COLVY_V211_TASK_ENHANCEMENTS',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'conversation_tasks'
              AND column_name = 'recurrence'),
   'conversation_tasks.recurrence'),

  ('COLVY_V212_TASK_SERIES',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'conversation_tasks'
              AND column_name = 'series_id'),
   'conversation_tasks.series_id'),

  -- Row level security.
  ('COLVY_V209_RLS_PHASE1_CREDENTIALS',
   EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_company_member'),
   'function is_company_member()'),

  ('COLVY_V210_RLS_PHASE2_CUSTOMER_DATA',
   EXISTS (SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'contacts'
              AND policyname = 'company_members_contacts'),
   'policy company_members_contacts on contacts'),

  ('COLVY_V220_PUSH_TOKENS_RLS_FIX',
   EXISTS (SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'push_tokens'
              AND policyname = 'push_tokens_own_or_member'),
   'policy push_tokens_own_or_member on push_tokens'),

  -- Feature migrations with no version number.
  ('COLVY_PRODUCT_SEARCH_INDEX',
   to_regclass('public.woocommerce_products_name_trgm') IS NOT NULL,
   'index woocommerce_products_name_trgm'),

  ('COLVY_CONTACT_LINE_TYPE',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'contacts'
              AND column_name = 'line_type'),
   'contacts.line_type')

) AS t(migration, applied, looks_for)
ORDER BY t.applied, t.migration;


-- ── If push notifications are the question ──────────────────────────────────
-- COLVY_V220 above is the one that governs whether a phone can store its push
-- token at all. These two say what the damage looks like right now: the first
-- counts rows no sender can ever deliver to (/api/push/send selects by
-- company_id), the second lists the policies currently on the table.
--
--   SELECT count(*) AS undeliverable_rows FROM push_tokens WHERE company_id IS NULL;
--   SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'push_tokens';
