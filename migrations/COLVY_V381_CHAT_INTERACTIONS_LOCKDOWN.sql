-- ============================================================
-- COLVY V381 — CHAT_INTERACTIONS: ONLY THE BUSINESS READS ITS IN-CHAT ANSWERS
--
-- chat_interactions holds what customers give in the chat widget when a
-- business sends them a poll, survey or form card: names, emails, phone
-- numbers, order numbers, free-text answers. V119 created it with
--   "Anyone can manage chat_interactions"  FOR ALL USING (true)
-- and no TO clause, so it applies to PUBLIC, anon included, and no migration
-- since has touched it. Anyone holding the public key (it ships in the web
-- bundle and the mobile app) could:
--   • read every business's in-chat answers;
--   • file answers into any chat, or rewrite / move / delete existing ones
--     (including re-stamping a row with another company_id).
--
-- After this:
--   • SELECT — signed-in staff of the row's workspace (is_company_member),
--     and only for a row whose conversation they can see and which belongs
--     to that same workspace. The conversation check runs as the caller, so
--     it follows whatever conversations' own rules allow (V299 membership,
--     V347's Inbox permission, any outlet rules) — staff who can't open a
--     chat can't read its answers. Rows with no conversation (very early
--     widget versions) are readable by the workspace's staff. The platform
--     admin can read every row.
--   • INSERT / UPDATE / DELETE — the server only. The widget's answers go
--     through /api/widget/interaction, which checks the chat key, that the
--     card is a poll / survey / form message this business sent into this
--     chat, and allows one answer per card. No staff screen (web or mobile)
--     writes this table, so the browser needs no write access at all.
--   • anon — nothing (no policy, no privilege).
--   • The service role (every server route) bypasses RLS and is unaffected.
--   • A unique index on (conversation_id, message_id) — one answer per card
--     per chat — if existing rows allow it; otherwise it says so and skips.
--
-- Board visitors (team role 'viewer') are not staff: is_company_member, as V337
-- left it, leaves them out — they get the same as a stranger.
--
-- Like V364 / V375 this doesn't guess policy names: it drops EVERY policy on
-- the table, whatever it's called (including any made by hand in the
-- dashboard), then creates exactly the one wanted, and takes away the table
-- privileges the API roles don't need, so a script that adds an open policy
-- back still can't reopen writes or anon reads.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- AFTER the code from branch claude/chat-lockdown is deployed. That code works
-- both before and after this runs (it reaches chat_interactions only through
-- /api/widget/interaction, with the service role). The code before it does
-- not work after: the widget read and wrote the table with the public key, so
-- answers would stop being saved (the "Responded: …" chat message still
-- arrives) and an answered card would show as unanswered again on reload.
-- Give open widget tabs a little while to reload after the deploy.
-- Needs is_company_member() from V209 as changed by V337; it stops with an
-- error, changing nothing, if that function is missing or is still V209's
-- original (which counted board visitors as members), or if chat_interactions
-- (V119) or conversations (V105) don't exist.
-- The mobile app (colvy-mobile) doesn't read or write this table, so it needs
-- no change.
-- COLVY_V119_CHAT_PAYMENTS.sql still creates the old open policy by name; if
-- its STEP 4 is ever re-run, run this file again.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. Step 5 lists one policy, chat_interactions_member_read (SELECT,
--      {authenticated}); step 6 must return no rows; step 7 lists rows whose
--      company doesn't match their conversation's (should be none — anything
--      there was written while the table was open; review it).
--   2. From the inbox send a poll, a survey and a (draft) form into a live
--      widget chat. As the visitor, answer each: the card turns to
--      "Submitted", the "✅ Responded: …" message reaches the inbox, and a
--      reload of the widget still shows "Submitted". Tap a poll twice
--      quickly: one answer is saved.
--   3. Signed out (anon key):
--        select * from chat_interactions;              → permission denied
--        insert into chat_interactions (kind) values ('x'); → permission denied
--      Signed in as staff of another workspace: select returns no rows.
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 0: what this builds on ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.is_company_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'is_company_member(uuid) is missing — run COLVY_V209_RLS_PHASE1_CREDENTIALS.sql and COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql first';
  END IF;
  -- V209's first version counted board visitors (role 'viewer') as members;
  -- V337 fixed that. The read rule leans on it, so refuse the old one rather
  -- than hand a board visitor a business's customers' answers.
  IF pg_get_functiondef(to_regprocedure('public.is_company_member(uuid)')) NOT ILIKE '%''viewer''%' THEN
    RAISE EXCEPTION 'is_company_member(uuid) still counts board visitors (role viewer) as members — run COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql first';
  END IF;
  IF to_regclass('public.conversations') IS NULL THEN
    RAISE EXCEPTION 'conversations is missing — run COLVY_V105_INBOX.sql first';
  END IF;
  IF to_regclass('public.chat_interactions') IS NULL THEN
    RAISE EXCEPTION 'chat_interactions is missing — nothing to lock (STEP 4 of COLVY_V119_CHAT_PAYMENTS.sql creates it)';
  END IF;
END $$;

-- The platform admin check from V351, repeated so this file stands alone
-- (same body as V351 / V364 / V375). anon can't execute it, so it only
-- appears in a policy for authenticated.
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT lower(COALESCE(auth.jwt() ->> 'email', '')) = 'bishalstha76@gmail.com'
$$;
REVOKE ALL ON FUNCTION is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated, service_role;

-- ── STEP 1: what is about to be dropped ─────────────────────────────────────
SELECT policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'chat_interactions'
 ORDER BY policyname;

-- ── STEP 2: reset the table ─────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  ALTER TABLE public.chat_interactions ENABLE ROW LEVEL SECURITY;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_interactions' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.chat_interactions', r.policyname);
    RAISE NOTICE 'dropped % on chat_interactions', r.policyname;
  END LOOP;
  -- Start from nothing; grant back exactly what the API roles need.
  REVOKE ALL ON public.chat_interactions FROM PUBLIC, anon, authenticated;
  GRANT ALL ON public.chat_interactions TO service_role;
END $$;

-- ── STEP 3: staff (and the platform admin) read ─────────────────────────────
DO $$
BEGIN

  -- The conversation sub-select runs as the caller, under conversations' own
  -- rules, and must be in the same workspace as the row: a row re-stamped
  -- with another company_id while the table was open doesn't hand that
  -- company a stranger's chat answers.
  CREATE POLICY chat_interactions_member_read ON public.chat_interactions
    FOR SELECT TO authenticated
    USING (
      is_platform_admin()
      OR (
        is_company_member(company_id)
        AND (
          conversation_id IS NULL
          OR EXISTS (SELECT 1 FROM public.conversations c
                      WHERE c.id = chat_interactions.conversation_id
                        AND c.company_id = chat_interactions.company_id)
        )
      )
    );

  -- No INSERT / UPDATE / DELETE policy or privilege: the server only.
  GRANT SELECT ON public.chat_interactions TO authenticated;
END $$;

-- ── STEP 4: one answer per card per chat ────────────────────────────────────
-- /api/widget/interaction checks before it inserts; this closes the gap
-- between two taps at once. Skipped (with a notice) if older rows already
-- hold duplicates — the route's check still applies; see the query below the
-- rollback to find them.
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_chat_interactions_message ON public.chat_interactions (message_id);
  IF to_regclass('public.chat_interactions_one_per_card') IS NOT NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.chat_interactions
              WHERE conversation_id IS NOT NULL AND message_id IS NOT NULL
              GROUP BY conversation_id, message_id HAVING count(*) > 1) THEN
    RAISE NOTICE 'chat_interactions has duplicate answers for the same card — unique index skipped';
    RETURN;
  END IF;
  CREATE UNIQUE INDEX chat_interactions_one_per_card
    ON public.chat_interactions (conversation_id, message_id)
    WHERE conversation_id IS NOT NULL AND message_id IS NOT NULL;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 5: confirm ─────────────────────────────────────────────────────────
-- Expect exactly one row: chat_interactions_member_read, SELECT, {authenticated}.
SELECT policyname, permissive, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'chat_interactions'
 ORDER BY policyname;

-- ── STEP 6: privileges the API roles shouldn't have ─────────────────────────
-- Should return no rows.
SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name = 'chat_interactions'
   AND (grantee IN ('anon', 'PUBLIC')
        OR (grantee = 'authenticated' AND privilege_type <> 'SELECT'));

-- ── STEP 7: rows filed against the wrong business ───────────────────────────
-- Written while the table was open to everyone. Should be none; review any.
SELECT i.id, i.created_at, i.company_id AS row_company, c.company_id AS conversation_company, i.kind
  FROM public.chat_interactions i
  JOIN public.conversations c ON c.id = i.conversation_id
 WHERE i.company_id IS DISTINCT FROM c.company_id
 ORDER BY i.created_at DESC
 LIMIT 100;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Only if something breaks and it can't wait for a fix. This reopens exactly
-- the hole closed above (anyone can read and rewrite every in-chat answer) —
-- a stopgap only. The code from claude/chat-lockdown keeps working either
-- way, so it doesn't need rolling back with it.
--
--   DROP POLICY IF EXISTS chat_interactions_member_read ON public.chat_interactions;
--   CREATE POLICY "Anyone can manage chat_interactions" ON public.chat_interactions FOR ALL USING (true);
--   GRANT ALL ON public.chat_interactions TO anon, authenticated;
--   DROP INDEX IF EXISTS public.chat_interactions_one_per_card;
--   DROP INDEX IF EXISTS public.idx_chat_interactions_message;
--   NOTIFY pgrst, 'reload schema';
--
-- Duplicate answers that stopped the unique index (STEP 4):
--   select conversation_id, message_id, count(*) from public.chat_interactions
--    where conversation_id is not null and message_id is not null
--    group by 1, 2 having count(*) > 1;
