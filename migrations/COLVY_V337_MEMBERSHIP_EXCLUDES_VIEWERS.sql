-- ============================================================
-- COLVY V337 — A BOARD VISITOR IS NOT A MEMBER OF THE BUSINESS
--
-- Anyone who signs up or signs in on a business's subdomain (or follows a
-- confirmation link carrying ?company_id=) is added to that business's
-- team_members as role 'viewer' (app/auth/callback/route.ts). is_company_member
-- (V209) accepts ANY team_members row, so that stranger passes every RLS rule
-- built on it — contacts, conversations, messages, events, the gallery,
-- scheduled messages, bookings, calendar, addresses, identities, push tokens —
-- and can read and change them straight from the database with the public key.
--
-- The admin already treats viewers as outsiders (only owner / admin / editor get
-- in — AppChrome and signin), so this makes the database agree:
--   • is_company_member: owner, or a team row that is not 'viewer' and not
--     'removed'. Same signature, so every policy that uses it picks this up.
--   • realestate_integrations and activity_logs had their own inline
--     "company_id IN (SELECT company_id FROM team_members …)" rules; they now
--     use is_company_member too.
-- The API routes got the same rule in lib/company-access.ts (isStaffMember).
--
-- The public board (ideas, votes, comments, announcements) doesn't use
-- is_company_member, so board visitors keep working as before.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. Step 4 lists any OTHER rule that still reads team_members directly —
--      send me that list if it isn't empty.
--   2. Web inbox, contacts, gallery and the mobile app work as normal for
--      owners, admins and editors.
--   3. A viewer-only account (e.g. a board sign-up) sees no contacts or
--      conversations: `select count(*) from contacts` as that user returns 0.
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 1: how many viewer rows exist (board visitors and read-only invites)
SELECT c.name AS company, count(*) AS viewers
  FROM team_members tm JOIN companies c ON c.id = tm.company_id
 WHERE lower(coalesce(tm.role, '')) = 'viewer'
 GROUP BY c.name ORDER BY viewers DESC;

-- ── STEP 2: membership excludes viewers and removed members ────────────────
CREATE OR REPLACE FUNCTION is_company_member(target UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM companies c
     WHERE c.id = target AND c.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM team_members tm
     WHERE tm.company_id = target
       AND tm.user_id = auth.uid()
       AND lower(COALESCE(tm.status, 'active')) <> 'removed'
       AND lower(COALESCE(tm.role, '')) <> 'viewer'
  );
$$;

REVOKE ALL ON FUNCTION is_company_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_company_member(UUID) TO authenticated, anon, service_role;

-- ── STEP 3: the two rules that checked team_members inline ─────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'realestate_integrations') THEN
    DROP POLICY IF EXISTS realestate_member_read ON public.realestate_integrations;
    CREATE POLICY realestate_member_read ON public.realestate_integrations
      FOR SELECT TO authenticated
      USING (is_company_member(company_id));
  END IF;
END $$;

DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'activity_logs') THEN
    FOR r IN
      SELECT policyname, cmd
        FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'activity_logs'
         AND (coalesce(qual, '') ILIKE '%team_members%' OR coalesce(with_check, '') ILIKE '%team_members%')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.activity_logs', r.policyname);
      RAISE NOTICE 'replaced % (%) on activity_logs', r.policyname, r.cmd;
    END LOOP;
    DROP POLICY IF EXISTS company_members_activity_logs ON public.activity_logs;
    CREATE POLICY company_members_activity_logs ON public.activity_logs
      FOR ALL TO authenticated
      USING (is_company_member(company_id))
      WITH CHECK (is_company_member(company_id));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 4: any other rule that still reads team_members directly ──────────
SELECT tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename <> 'team_members'
   AND (coalesce(qual, '') ILIKE '%team_members%' OR coalesce(with_check, '') ILIKE '%team_members%')
 ORDER BY tablename, policyname;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Only if staff lose access and it can't wait. This lets board visitors back in.
--
--   CREATE OR REPLACE FUNCTION is_company_member(target UUID) RETURNS BOOLEAN
--   LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
--     SELECT EXISTS (SELECT 1 FROM companies c WHERE c.id = target AND c.owner_id = auth.uid())
--         OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.company_id = target
--                     AND tm.user_id = auth.uid() AND COALESCE(tm.status, 'active') <> 'removed');
--   $$;
--   NOTIFY pgrst, 'reload schema';

-- ── ALSO: invite links carry a code ─────────────────────────────────────────
-- /api/team/accept-invite set the password of any account that had a team row,
-- given only the email. Invite links now carry a random code; the row keeps its
-- SHA-256 here and the server compares. Invites sent before this have no code:
-- resend them from Team (signed-in invitees can still accept without one).
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS invite_token_hash TEXT;
NOTIFY pgrst, 'reload schema';
