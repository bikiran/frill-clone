-- ============================================================
-- COLVY V379 — A MESSAGE CAN ONLY GO INTO ITS OWN BUSINESS'S CONVERSATION
--
-- Since V210 / V299, messages has one permissive rule for the browser:
--   company_members_messages  FOR ALL TO authenticated
--     USING / WITH CHECK (is_company_member(company_id))
-- (plus V347's restrictive perm_*_messages feature gates). It checks the
-- message row's own company_id — never the conversation's. So staff of ANY
-- workspace B, knowing a conversation id of business A, could insert a
-- message stamped company_id = B into A's conversation (or move one of B's
-- messages there with an UPDATE). It lands in A's thread, A's triggers bump
-- and reopen A's conversation, and it could fake "the business sent this"
-- (e.g. a form card the widget trusts).
--
-- After this, a browser INSERT or UPDATE on messages must also satisfy:
-- the conversation it points at (if any) belongs to the same company as the
-- message. Added as RESTRICTIVE policies, so everything V299 / V347 allow
-- stays exactly as it is, minus the mismatch. Reads and deletes are
-- unchanged.
--
-- Unaffected:
--   • the server (service role bypasses RLS) — every widget / visitor path:
--     /api/widget/start, /api/widget/message, SMS / email / Meta webhooks,
--     the AI and smart triggers;
--   • visitors never write messages from the browser (anon has no policy on
--     messages at all, since V299);
--   • staff writing into their own business's conversations — the inbox,
--     gallery "send to chat", call bar, the mobile app (all set company_id to
--     the workspace whose conversation they have open).
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- Any time; no code change is needed first (independent of V375). Needs
-- V299 applied — it stops, changing nothing, if company_members_messages is
-- missing. V299 drops every other policy on messages, so if V299 is ever
-- re-run, run this again after it. Safe to re-run. Rollback at the bottom.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. Step 3 lists messages' policies: company_members_messages, the perm_*
--      ones if V347 ran, and the two new messages_same_company_* ones.
--   2. Send a reply, an attachment and a form from the web inbox and the
--      mobile app; merge two conversations; react to a message. All work.
--   3. Step 4 lists messages already sitting in another company's
--      conversation (should be none; review any that show up).
-- ============================================================

-- ── STEP 0: what this builds on ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.messages') IS NULL OR to_regclass('public.conversations') IS NULL THEN
    RAISE EXCEPTION 'messages / conversations are missing — run COLVY_V105_INBOX.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'messages'
                  AND policyname = 'company_members_messages') THEN
    RAISE EXCEPTION 'messages has no company_members_messages policy — run COLVY_V299_RLS_DROP_LEFTOVER_PUBLIC_POLICIES.sql first';
  END IF;
END $$;

-- ── STEP 1: does this conversation belong to this company? ──────────────────
-- SECURITY DEFINER so the answer doesn't depend on which conversations the
-- caller may read (V347's feature gates, any later outlet rules) — only on the
-- facts. A message with no conversation has nothing to mismatch.
CREATE OR REPLACE FUNCTION message_conversation_matches(conv UUID, company UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT conv IS NULL
      OR EXISTS (SELECT 1 FROM conversations c WHERE c.id = conv AND c.company_id = company)
$$;
REVOKE ALL ON FUNCTION message_conversation_matches(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION message_conversation_matches(UUID, UUID) TO authenticated, service_role;

-- ── STEP 2: the restrictive rules ───────────────────────────────────────────
DO $$
BEGIN
  DROP POLICY IF EXISTS messages_same_company_insert ON public.messages;
  CREATE POLICY messages_same_company_insert ON public.messages
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (message_conversation_matches(conversation_id, company_id));

  -- USING (true): which rows may be updated is still V299 / V347's call; this
  -- only stops a row ending up in another company's conversation.
  DROP POLICY IF EXISTS messages_same_company_update ON public.messages;
  CREATE POLICY messages_same_company_update ON public.messages
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (message_conversation_matches(conversation_id, company_id));
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 3: confirm ─────────────────────────────────────────────────────────
SELECT policyname, permissive, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'messages'
 ORDER BY policyname;

-- ── STEP 4: anything filed into the wrong business in the last 90 days ─────
SELECT m.id, m.created_at, m.company_id AS message_company, c.company_id AS conversation_company, m.sender_type
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
 WHERE m.company_id IS DISTINCT FROM c.company_id
   AND m.created_at > now() - interval '90 days'
 ORDER BY m.created_at DESC
 LIMIT 100;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   DROP POLICY IF EXISTS messages_same_company_insert ON public.messages;
--   DROP POLICY IF EXISTS messages_same_company_update ON public.messages;
--   DROP FUNCTION IF EXISTS message_conversation_matches(UUID, UUID);
--   NOTIFY pgrst, 'reload schema';
