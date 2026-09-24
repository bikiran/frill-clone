-- ============================================================
-- COLVY V299 — REMOVE THE `USING (true)` POLICIES V210 LEFT BEHIND
--
-- V210 added company_members_* policies to contacts, conversations, messages
-- and conversation_events, and believed it had closed the multi-tenant leak.
-- It had not. Checking the live database:
--
--   messages       Anyone can send messages          ALL     true
--   messages       company_members_messages          ALL     is_company_member(company_id)
--   contacts       Anyone can access contacts        ALL     true
--   contacts       company_members_contacts          ALL     is_company_member(company_id)
--   conversations  Anyone can create conversations   INSERT  (null)
--   conversations  Anyone can update conversations   UPDATE  true
--   conversations  company_members_conversations     ALL     is_company_member(company_id)
--
-- PostgreSQL combines PERMISSIVE policies with OR. A row is allowed if ANY of
-- them passes. So `USING (true)` does not sit alongside the company check —
-- it overrides it completely. Every one of those tables has been wide open
-- this whole time, with a policy next to it that looks like it is doing the
-- job.
--
-- The policies carry no TO clause, which means TO PUBLIC — anon included. The
-- anon key is shipped in the web bundle and inside the Android app, so this is
-- reachable by anyone who has ever installed either: read and write, every
-- company's customers, conversations and messages.
--
-- Why V210 missed them: it dropped by guessed names —
--   'Anyone can manage ' || t, 'Anyone can read ' || t, 'Anyone can insert '
--   || t, 'Public read ' || t
-- and the real names were "Anyone can send messages" (V105), "Anyone can
-- access contacts", "Anyone can create conversations" and "Anyone can update
-- conversations". Nothing matched, nothing was dropped, and the migration
-- reported success.
--
-- So this one does not guess. It drops EVERY policy on those tables except the
-- company_members_* ones, whatever they are called.
--
-- ── BEFORE RUNNING ──────────────────────────────────────────────────────────
-- Step 1 below prints exactly what will be dropped. Read it first.
--
-- V210's reasoning for why this is safe still holds: the public chat widget no
-- longer touches these tables with the anon key, it goes through server
-- endpoints that use the service role and bypass RLS entirely
-- (/api/widget/start, /api/widget/message, /api/widget/messages,
-- /api/widget/update). Note this has never actually been tested, because the
-- permissive policies were still in place — so verify the widget afterwards.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. Step 3 below: only company_members_* should remain.
--   2. Signed OUT, `select * from messages;` must return ZERO rows.
--   3. Open the widget, start a chat, send a message, reload for history.
--   4. Reply from the inbox; it should appear in the widget.
--   5. The admin inbox and the mobile app behave as before.
--
-- Rollback is at the bottom. It reopens the leak — a stopgap only.
-- ============================================================

-- ── STEP 1: what is about to be dropped ─────────────────────────────────────
SELECT tablename, policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('contacts', 'conversations', 'messages', 'conversation_events')
   AND policyname <> 'company_members_' || tablename
 ORDER BY tablename, policyname;

-- ── STEP 2: drop them ───────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('contacts', 'conversations', 'messages', 'conversation_events')
       AND policyname <> 'company_members_' || tablename
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'dropped % on %', r.policyname, r.tablename;
  END LOOP;
END $$;

-- Make sure the company policy actually exists on each table, in case a table
-- was left with nothing at all — which would lock staff out rather than let
-- strangers in, but is still not what we want.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['contacts', 'conversations', 'messages', 'conversation_events'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'company_members_' || t, t);
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I
          FOR ALL
          TO authenticated
          USING (is_company_member(company_id))
          WITH CHECK (is_company_member(company_id))
      $f$, 'company_members_' || t, t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 3: confirm ─────────────────────────────────────────────────────────
-- Expect exactly one row per table, TO authenticated, is_company_member.
SELECT tablename, policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('contacts', 'conversations', 'messages', 'conversation_events')
 ORDER BY tablename, policyname;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Only if customer chat breaks and cannot wait. This reopens the leak.
--
--   CREATE POLICY "Anyone can send messages" ON public.messages FOR ALL USING (true);
--   CREATE POLICY "Anyone can access contacts" ON public.contacts FOR ALL USING (true);
--   CREATE POLICY "Anyone can update conversations" ON public.conversations FOR UPDATE USING (true);
--   CREATE POLICY "Anyone can create conversations" ON public.conversations FOR INSERT WITH CHECK (true);
--   NOTIFY pgrst, 'reload schema';
