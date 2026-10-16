-- ============================================================
-- COLVY V381 — CHAT_INTERACTIONS: IN-CHAT ANSWERS ARE SERVER ONLY
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
-- After this the table is server only:
--   • no policy, and no table privilege at all for anon, authenticated or
--     PUBLIC — not even SELECT. No screen (web inbox, admin pages, mobile
--     app) reads this table, so nothing in the browser needs it;
--   • the widget reaches it only through /api/widget/interaction, which checks
--     the chat key, that the card is a poll / survey / form message this
--     business sent into this chat, and allows one answer per card;
--   • the service role (every server route) bypasses RLS and is unaffected.
-- With no privileges, a permissive policy added back later — by hand, or by
-- re-running V119 STEP 4 — still can't open the table to the browser: the
-- API roles would get "permission denied" before RLS is even consulted.
-- If a staff screen ever needs these answers, give it a server route (or a
-- narrow member-read policy plus GRANT SELECT TO authenticated) then.
--
-- Also:
--   • the table is marked with a comment starting "COLVY V381"; V119 STEP 4
--     looks for it and no longer recreates its open policy once this has run;
--   • a unique index on (conversation_id, message_id) — one answer per card
--     per chat — if existing rows allow it; otherwise it says so and skips.
--
-- Like V364 / V375 this doesn't guess policy names: it drops EVERY policy on
-- the table, whatever it's called (including any made by hand in the
-- dashboard).
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- AFTER the code from branch claude/chat-lockdown is deployed. That code works
-- both before and after this runs (it reaches chat_interactions only through
-- /api/widget/interaction, with the service role). The code before it does
-- not work after: the widget read and wrote the table with the public key, so
-- answers would stop being saved (the "Responded: …" chat message still
-- arrives) and an answered card would show as unanswered again on reload.
-- Give open widget tabs a little while to reload after the deploy.
-- Needs chat_interactions (V119) and conversations (V105); it stops with an
-- error, changing nothing, if either is missing.
-- The mobile app (colvy-mobile) doesn't read or write this table, so it needs
-- no change.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. Step 4 lists no policies; step 5 must return no rows; step 6 lists rows
--      whose company doesn't match their conversation's (should be none —
--      anything there was written while the table was open; review it).
--   2. From the inbox send a poll, a survey and a (draft) form into a live
--      widget chat. As the visitor, answer each: the card turns to
--      "Submitted", the "✅ Responded: …" message reaches the inbox, and a
--      reload of the widget still shows "Submitted". Tap a poll twice
--      quickly: one answer is saved.
--   3. Signed out (anon key) and signed in as any user:
--        select * from chat_interactions;                   → permission denied
--        insert into chat_interactions (kind) values ('x'); → permission denied
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 0: what this builds on ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.chat_interactions') IS NULL THEN
    RAISE EXCEPTION 'chat_interactions is missing — nothing to lock (STEP 4 of COLVY_V119_CHAT_PAYMENTS.sql creates it)';
  END IF;
  IF to_regclass('public.conversations') IS NULL THEN
    RAISE EXCEPTION 'conversations is missing — run COLVY_V105_INBOX.sql first';
  END IF;
END $$;

-- ── STEP 1: what is about to be dropped ─────────────────────────────────────
SELECT policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'chat_interactions'
 ORDER BY policyname;

-- ── STEP 2: server only ─────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  ALTER TABLE public.chat_interactions ENABLE ROW LEVEL SECURITY;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_interactions' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.chat_interactions', r.policyname);
    RAISE NOTICE 'dropped % on chat_interactions', r.policyname;
  END LOOP;
  -- No policy and no privilege for the API roles: the service role only.
  REVOKE ALL ON public.chat_interactions FROM PUBLIC, anon, authenticated;
  GRANT ALL ON public.chat_interactions TO service_role;
  -- The marker V119 STEP 4 checks before it would recreate its open policy.
  COMMENT ON TABLE public.chat_interactions IS
    'COLVY V381: server only. Answers to in-chat polls / surveys / forms; written and read through /api/widget/interaction with the service role. Do not add policies or grants for anon / authenticated.';
END $$;

-- ── STEP 3: one answer per card per chat ────────────────────────────────────
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

-- ── STEP 4: confirm ─────────────────────────────────────────────────────────
-- Expect no rows (no policies).
SELECT policyname, permissive, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'chat_interactions'
 ORDER BY policyname;

-- ── STEP 5: privileges the API roles shouldn't have ─────────────────────────
-- Should return no rows.
SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name = 'chat_interactions'
   AND grantee IN ('anon', 'authenticated', 'PUBLIC');

-- ── STEP 6: rows filed against the wrong business ───────────────────────────
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
--   COMMENT ON TABLE public.chat_interactions IS NULL;
--   CREATE POLICY "Anyone can manage chat_interactions" ON public.chat_interactions FOR ALL USING (true);
--   GRANT ALL ON public.chat_interactions TO anon, authenticated;
--   DROP INDEX IF EXISTS public.chat_interactions_one_per_card;
--   DROP INDEX IF EXISTS public.idx_chat_interactions_message;
--   NOTIFY pgrst, 'reload schema';
--
-- Duplicate answers that stopped the unique index (STEP 3):
--   select conversation_id, message_id, count(*) from public.chat_interactions
--    where conversation_id is not null and message_id is not null
--    group by 1, 2 having count(*) > 1;
