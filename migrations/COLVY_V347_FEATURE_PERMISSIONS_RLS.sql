-- ============================================================
-- COLVY V347 — Team permissions enforced by the database
-- ============================================================
-- The Team page's per-member permissions (team_members.permissions, V306)
-- were only applied by the web sidebar and the mobile app's screens. A member
-- with Inbox switched off couldn't SEE the inbox, but the data was still
-- readable straight from the database with their login.
--
-- This adds RESTRICTIVE row-level policies on each feature's tables, on top
-- of the existing workspace-membership policies (which stay as they are): a
-- row is reachable only if the existing rules allow it AND the member may use
-- one of the features that table serves. Same rules as lib/permissions.ts:
--   • the owner, and members with role owner/admin, always pass;
--   • a member with no permissions map passes (nobody is locked out by default);
--   • only features explicitly set to false are blocked.
-- Server routes use the service role and are unaffected.
--
-- Tables shared by several features pass for ANY of them, so one feature
-- doesn't break another — e.g. contacts are readable with Contacts, Inbox,
-- Call Logs or Orders (the inbox needs names); gallery media with Gallery or
-- Inbox (the chat's "Add to chat" picker); tasks with Tasks, Calendar or
-- Inbox. Call rows can always be WRITTEN, since anyone who takes a call logs
-- it; reading call history needs Call Logs or Inbox.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. Step 4 lists the policies created — one set per table that exists.
--   2. As an owner/admin: the web inbox, contacts, tasks, calendar, gallery and
--      orders all work as before, and so does the mobile app.
--   3. As a limited member (e.g. Tasks + Calendar only): tasks and the calendar
--      work; `select count(*) from conversations` and `from messages` return 0.
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 1: workspaces the signed-in user may use a feature in ─────────────
-- Uncorrelated set functions, so each policy evaluates them once per query
-- (not once per row).
CREATE OR REPLACE FUNCTION feature_companies(features TEXT[])
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT c.id FROM companies c WHERE c.owner_id = auth.uid()
  UNION
  SELECT tm.company_id FROM team_members tm
   WHERE tm.user_id = auth.uid()
     AND (
       lower(coalesce(tm.role, '')) IN ('owner', 'admin')
       OR tm.permissions IS NULL
       OR jsonb_typeof(tm.permissions) <> 'object'
       OR EXISTS (
         SELECT 1 FROM unnest(features) f
          WHERE coalesce(tm.permissions ->> f, 'true') <> 'false'
       )
     )
$$;

-- Workspaces the user belongs to at all. A row in a workspace they're NOT a
-- member of is left entirely to the existing policies (which deny it), so
-- these rules can't affect anything outside a member's own workspaces.
CREATE OR REPLACE FUNCTION member_companies()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT c.id FROM companies c WHERE c.owner_id = auth.uid()
  UNION
  SELECT tm.company_id FROM team_members tm WHERE tm.user_id = auth.uid()
$$;

-- ── STEP 2: which features each table serves ────────────────────────────────
-- table, features (any one is enough), whether writes are gated too.
CREATE TEMP TABLE IF NOT EXISTS _v347_gates (tbl TEXT, features TEXT[], gate_writes BOOLEAN);
TRUNCATE _v347_gates;
INSERT INTO _v347_gates VALUES
  -- Inbox
  ('conversations',        ARRAY['inbox','calls'],                 TRUE),
  ('messages',             ARRAY['inbox'],                         TRUE),
  ('conversation_notes',   ARRAY['inbox'],                         TRUE),
  ('conversation_events',  ARRAY['inbox'],                         TRUE),
  ('conversation_pins',    ARRAY['inbox'],                         TRUE),
  ('scheduled_messages',   ARRAY['inbox','scheduled'],             TRUE),
  ('quick_responses',      ARRAY['inbox'],                         TRUE),
  -- Contacts (names are needed by the inbox, calls and orders too)
  ('contacts',             ARRAY['contacts','inbox','calls','orders'], TRUE),
  -- Calls: anyone who takes a call writes its row; reading history is gated
  ('calls',                ARRAY['calls','inbox'],                 FALSE),
  ('call_recording_plays', ARRAY['calls','inbox'],                 FALSE),
  -- Tasks (shown on the calendar; created from chats)
  ('conversation_tasks',   ARRAY['tasks','calendar','inbox'],      TRUE),
  ('task_comments',        ARRAY['tasks','calendar','inbox'],      TRUE),
  ('task_activity',        ARRAY['tasks','calendar','inbox'],      TRUE),
  -- Notes, calendar
  ('notes',                ARRAY['notes'],                         TRUE),
  ('calendar_events',      ARRAY['calendar'],                      TRUE),
  -- Gallery (also the chat's media picker)
  ('media_items',          ARRAY['gallery','inbox'],               TRUE),
  ('media_folders',        ARRAY['gallery','inbox'],               TRUE),
  ('media_categories',     ARRAY['gallery','inbox'],               TRUE),
  ('media_item_categories',ARRAY['gallery','inbox'],               TRUE),
  -- Orders
  ('orders',               ARRAY['orders'],                        TRUE),
  ('order_items',          ARRAY['orders'],                        TRUE),
  ('order_tags',           ARRAY['orders'],                        TRUE),
  ('order_notes',          ARRAY['orders'],                        TRUE),
  ('order_events',         ARRAY['orders'],                        TRUE),
  ('order_fulfillments',   ARRAY['orders'],                        TRUE),
  ('order_stock_alerts',   ARRAY['orders'],                        TRUE),
  ('order_drafts',         ARRAY['orders'],                        TRUE),
  ('woocommerce_orders',   ARRAY['orders'],                        TRUE),
  ('woocommerce_customers',ARRAY['orders','contacts'],             TRUE),
  ('abandoned_carts',      ARRAY['orders'],                        TRUE),
  -- Reviews, social
  ('google_reviews',       ARRAY['reviews'],                       TRUE),
  ('social_posts',         ARRAY['social'],                        TRUE),
  ('social_comments',      ARRAY['social'],                        TRUE);

-- ── STEP 3: the restrictive policies ────────────────────────────────────────
DO $$
DECLARE
  g RECORD;
  cond TEXT;
BEGIN
  FOR g IN SELECT * FROM _v347_gates LOOP
    -- Only tables that exist here and carry a workspace column.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = g.tbl AND column_name = 'company_id'
    ) THEN
      RAISE NOTICE 'skipped % (no table or no company_id)', g.tbl;
      CONTINUE;
    END IF;

    cond := format(
      '(company_id IS NULL OR company_id IN (SELECT feature_companies(%L::text[])) OR company_id NOT IN (SELECT member_companies()))',
      g.features
    );

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', g.tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'perm_select_' || g.tbl, g.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING %s',
                   'perm_select_' || g.tbl, g.tbl, cond);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'perm_insert_' || g.tbl, g.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'perm_update_' || g.tbl, g.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'perm_delete_' || g.tbl, g.tbl);
    IF g.gate_writes THEN
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK %s',
                     'perm_insert_' || g.tbl, g.tbl, cond);
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING %s WITH CHECK %s',
                     'perm_update_' || g.tbl, g.tbl, cond, cond);
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING %s',
                     'perm_delete_' || g.tbl, g.tbl, cond);
    END IF;
    RAISE NOTICE 'gated % for %', g.tbl, g.features;
  END LOOP;
END $$;

-- ── STEP 4: what was created ────────────────────────────────────────────────
SELECT tablename, policyname, cmd, permissive
  FROM pg_policies
 WHERE schemaname = 'public' AND policyname LIKE 'perm\_%'
 ORDER BY tablename, policyname;

-- ── ROLLBACK (only if something breaks) ────────────────────────────────────
-- Removes every policy this migration added; the original membership rules
-- are untouched, so access goes back to exactly what it was before.
--
-- DO $$
-- DECLARE r RECORD;
-- BEGIN
--   FOR r IN SELECT tablename, policyname FROM pg_policies
--             WHERE schemaname = 'public' AND policyname LIKE 'perm\_%' LOOP
--     EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
--   END LOOP;
-- END $$;
-- DROP FUNCTION IF EXISTS feature_companies(TEXT[]);
-- DROP FUNCTION IF EXISTS member_companies();
