-- ============================================================
-- COLVY V210 — ROW LEVEL SECURITY, PHASE 2: CUSTOMER DATA
--
-- This closes the multi-tenant leak. Until now `contacts`, `conversations` and
-- `messages` were governed by `USING (true)` policies, so anyone holding the
-- public anon key — which ships in every browser — could read and write EVERY
-- company's customers, conversations and messages.
--
-- ── WHY THIS IS ONLY SAFE NOW ───────────────────────────────────────────────
-- These tables could not be locked earlier because the public chat widget used
-- them directly with the anon key. That has been removed: the widget now goes
-- through server endpoints, which use the service role key and bypass RLS.
--
--   /api/widget/start     find-or-create contact, reuse conversation
--   /api/widget/message   visitor messages and attachments
--   /api/widget/messages  conversation history
--   /api/widget/update    presence, outlet choice, reactions
--
-- Live replies arrive over Broadcast rather than by watching the messages
-- table, so realtime no longer depends on visitors being able to read rows.
--
-- ⚠️ BEFORE RUNNING: deploy the application changes first. Applying this
--    against an older deployment will break customer chat immediately.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. Signed OUT, `select * from contacts;` should return ZERO rows.
--   2. Open the widget, start a chat, send a message — it should work.
--   3. Reply from the inbox — it should appear in the widget instantly.
--   4. Reload the widget — history should return.
--   5. The admin inbox should behave exactly as before.
--
-- If anything breaks, the rollback is at the bottom of this file.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- is_company_member() is created by V209. Fail clearly rather than silently
-- producing policies that let nobody in.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'is_company_member'
  ) THEN
    RAISE EXCEPTION 'Run COLVY_V209_RLS_PHASE1_CREDENTIALS.sql first — it creates is_company_member().';
  END IF;
END $$;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['contacts', 'conversations', 'messages', 'conversation_events'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

      -- Clear the permissive policies.
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'Anyone can manage ' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'Anyone can read ' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'Anyone can insert ' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'Public read ' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'company_members_' || t, t);

      -- Staff only, scoped to their own company. Anonymous visitors get
      -- nothing: everything they do runs through the server endpoints, which
      -- use the service role and are not subject to these policies.
      EXECUTE format($f$
        CREATE POLICY %I ON %I
          FOR ALL
          TO authenticated
          USING (is_company_member(company_id))
          WITH CHECK (is_company_member(company_id))
      $f$, 'company_members_' || t, t);

      RAISE NOTICE 'RLS locked: %', t;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- If customer chat breaks, this restores the previous behaviour immediately.
-- It reopens the leak, so treat it as a stopgap while the cause is found.
--
--   DO $$
--   DECLARE t TEXT;
--   BEGIN
--     FOREACH t IN ARRAY ARRAY['contacts','conversations','messages','conversation_events'] LOOP
--       EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'company_members_' || t, t);
--       EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (true)', 'Anyone can manage ' || t, t);
--     END LOOP;
--   END $$;
--   NOTIFY pgrst, 'reload schema';
