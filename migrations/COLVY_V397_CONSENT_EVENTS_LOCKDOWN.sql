-- ============================================================
-- COLVY V397 — CONSENT EVENTS: STAFF READ, SERVER WRITE
--
-- Goes with branch claude/email-channel-wiring (email campaigns in the
-- campaign wizard). Email campaigns lean on the consent audit trail — every
-- subscribe / unsubscribe / opt-out a customer makes is logged in
-- consent_events — and V193 left that table open to everyone:
--   consent_events  consent_events_all  FOR ALL USING (true) WITH CHECK (true)
-- No TO clause, so it applies to anon too: anyone holding the public key
-- (it ships in the web bundle) could read every business's consent history
-- (who unsubscribed, when, from where), forge "subscribed" events, or delete
-- the record a business would rely on if a customer disputed a message.
--
-- After this:
--   • SELECT — staff of the event's workspace (is_company_member, which leaves
--     out board visitors and removed members) and the platform admin.
--   • INSERT / UPDATE / DELETE — the server only (service role). Every writer
--     is a server route or library (lib/sms-consent, lib/email-preferences,
--     lib/shopify-customers, lib/missed-call-text); no browser code writes
--     or reads this table, and the mobile app doesn't touch it.
--   The service role bypasses RLS and is unaffected.
--
-- Like V375 / V394 this drops EVERY policy on the table, whatever it's called,
-- then creates exactly the one wanted, and takes away the table privileges
-- the API roles don't need, so an old script that adds a permissive policy
-- back still can't reopen writes.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- Any time, before or after the deploy: nothing in the app reads or writes
-- consent_events with the public key, so no code depends on the open policy.
-- Quick: no data is changed; one index on consent_events is built (seconds at
-- most, a brief write lock on that table).
-- Needs is_company_member() from V209 as changed by V337; stops with an
-- error, changing nothing, if that's missing or still counts board visitors.
-- V193 creates the open policy by name; if it's ever re-run, run this again.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   Signed out (anon key):  select * from consent_events;            → permission denied
--   As staff:               insert into consent_events (...)          → permission denied
--   Unsubscribe from a campaign email: the event is still logged (server).
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 0: what this builds on ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.is_company_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'is_company_member(uuid) is missing — run COLVY_V209_RLS_PHASE1_CREDENTIALS.sql and COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql first';
  END IF;
  IF pg_get_functiondef(to_regprocedure('public.is_company_member(uuid)')) NOT ILIKE '%''viewer''%' THEN
    RAISE EXCEPTION 'is_company_member(uuid) still counts board visitors (role viewer) as members — run COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql first';
  END IF;
END $$;

-- The platform admin check (same body as V351 / V364 / V375 / V394).
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
SELECT tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consent_events';

-- ── STEP 2: consent_events ──────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  IF to_regclass('public.consent_events') IS NULL THEN
    RAISE NOTICE 'consent_events does not exist — skipped';
    RETURN;
  END IF;
  ALTER TABLE public.consent_events ENABLE ROW LEVEL SECURITY;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consent_events' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.consent_events', r.policyname);
    RAISE NOTICE 'dropped % on consent_events', r.policyname;
  END LOOP;
  REVOKE ALL ON public.consent_events FROM anon, authenticated;
  GRANT ALL ON public.consent_events TO service_role;

  -- A contact's consent history, for staff of its workspace. Events with no
  -- workspace (company_id NULL, from old imports) only the platform admin sees.
  CREATE POLICY consent_events_member_read ON public.consent_events
    FOR SELECT TO authenticated
    USING (is_company_member(company_id) OR is_platform_admin());

  GRANT SELECT ON public.consent_events TO authenticated;
END $$;

-- The history is read newest first per contact (V193 made that index);
-- staff reads filter by workspace too.
DO $$
BEGIN
  IF to_regclass('public.consent_events') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_consent_events_company ON public.consent_events (company_id, created_at DESC);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 3: confirm ─────────────────────────────────────────────────────────
-- Expect one row: consent_events_member_read, SELECT, {authenticated}.
SELECT tablename, policyname, cmd, roles
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consent_events';
-- Expect only authenticated:SELECT.
SELECT grantee, privilege_type FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'consent_events' AND grantee IN ('anon', 'authenticated');

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Reopens exactly the hole described above. The code keeps working either way.
--
-- DROP POLICY IF EXISTS consent_events_member_read ON consent_events;
-- CREATE POLICY consent_events_all ON consent_events FOR ALL USING (true) WITH CHECK (true);
-- GRANT ALL ON consent_events TO anon, authenticated;
-- DROP INDEX IF EXISTS idx_consent_events_company;
-- NOTIFY pgrst, 'reload schema';
