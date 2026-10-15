-- ============================================================
-- COLVY V364 — ONLY THE SERVER CHANGES THE TEAM (AND THE AUDIT LOG)
--
-- team_members has carried these since DATABASE_SETUP.sql:
--   "Team members are viewable by everyone"   SELECT  USING (true)
--   "Anyone can manage team members"          ALL     USING (true)
-- with no TO clause — so TO PUBLIC, anon included — and no migration has ever
-- removed them. PostgreSQL ORs permissive policies together, so anyone holding
-- the public key (it ships in the web bundle and the mobile app) could:
--   • read every staff member of every business: emails, roles, permissions;
--   • set their own row to role 'admin', or insert a row for ANY company, and
--     then — through is_company_member — read and change everything in it;
--   • demote or delete the real staff of any business.
--
-- The rule was left open because the Team page wrote role changes, permission
-- maps, removals, default outlets and invites straight from the browser. Those
-- now go through /api/team/members, which allows them only for the owner or an
-- admin, never lets anyone raise their own role, protects owners (admins can't
-- change one, the owner of record can't be demoted or removed, a workspace
-- keeps at least one owner) and writes every change to the audit log. Profile
-- and onboarding save a person's own mobile / name through /api/team/me.
-- Everything else that writes team_members was already on the server with the
-- service role: accepting invites, sign-up and new-workspace owner rows, board
-- visitors' 'viewer' rows (/auth/callback), Create User and the platform
-- admin's tools.
--
-- After this, on team_members:
--   • SELECT — your own rows; every row of a workspace you're staff in (owner,
--     admin or agent: is_company_member, which leaves out board visitors);
--     and the platform admin.
--   • INSERT / UPDATE / DELETE — nobody but the server (service role, which
--     bypasses RLS). No policy, and no table privilege either.
--   • anon — nothing.
--
-- activity_logs gets the same treatment. V337 left it FOR ALL to any member,
-- so anyone could add, edit or delete entries — an audit log people can tidy
-- isn't one. Now workspace staff can read it (Settings → Audit Logs), and only
-- the server writes it. The table is created here if it never was (it was
-- only in the unnumbered add_activity_logs.sql).
--
-- Like V299 / V351 / V352 this doesn't guess policy names: it drops EVERY
-- policy on both tables, whatever it's called — including any made by hand in
-- the dashboard — then creates exactly the ones wanted.
--
-- ── BEFORE RUNNING ──────────────────────────────────────────────────────────
-- Deploy the code first (branch claude/security-lockdown). The old Team page
-- writes from the browser and stops working the moment this runs.
-- Step 1 prints what is about to be dropped.
-- The mobile app lives in another repo: make sure it only READS team_members
-- (its own row, for role and permissions) — any write from it will now fail.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. Step 5: team_members has only team_members_read; activity_logs only
--      activity_logs_member_read; api writes = 0 on both.
--   2. As the owner or an admin, on Team: change a role, permissions, outlet
--      and mobile; invite, resend and remove someone. Each one shows up under
--      Settings → Audit Logs.
--   3. As an agent: Team is read-only; inbox, tasks, calendar, the board and
--      the mobile app work as before.
--   4. Signed out (anon key): `select * from team_members` returns nothing.
--   5. Signed in as a board visitor: you see only your own row, and
--      `update team_members set role = 'admin' where user_id = auth.uid()`
--      is refused.
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- The platform admin check from V351, repeated so this file stands alone.
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
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('team_members', 'activity_logs')
 ORDER BY tablename, policyname;

-- ── STEP 2: team_members ────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

  -- The two from DATABASE_SETUP.sql by name, then anything else on the table.
  DROP POLICY IF EXISTS "Team members are viewable by everyone" ON public.team_members;
  DROP POLICY IF EXISTS "Anyone can manage team members" ON public.team_members;
  FOR r IN SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'team_members' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.team_members', r.policyname);
    RAISE NOTICE 'dropped % on team_members', r.policyname;
  END LOOP;

  -- Your own rows (the admin shell, the board and the mobile app read your role
  -- and permissions from them — board visitors included), the whole team of a
  -- workspace you're staff in (Team page, assignee pickers, mentions), and the
  -- platform admin. is_company_member is SECURITY DEFINER, so it reads
  -- team_members without going through this policy (no recursion).
  CREATE POLICY team_members_read ON public.team_members
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR is_company_member(company_id) OR is_platform_admin());

  -- Belt and braces: even if a permissive policy is added again by an old
  -- script, the API roles have no privilege to write.
  REVOKE ALL ON public.team_members FROM anon, authenticated;
  GRANT SELECT ON public.team_members TO authenticated;
  GRANT ALL ON public.team_members TO service_role;
END $$;

-- ── STEP 3: activity_logs (the audit log) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL,
  description   TEXT NOT NULL,
  metadata      JSONB,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- The Audit Logs page lists one workspace newest-first.
CREATE INDEX IF NOT EXISTS idx_activity_logs_company_created
  ON activity_logs (company_id, created_at DESC);

DO $$
DECLARE r RECORD;
BEGIN
  ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

  -- add_activity_logs.sql's "Users can view activity logs for their company"
  -- and V337's company_members_activity_logs, plus anything else.
  FOR r IN SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'activity_logs' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.activity_logs', r.policyname);
    RAISE NOTICE 'dropped % on activity_logs', r.policyname;
  END LOOP;

  -- Staff of the workspace (the Audit Logs page reads as the signed-in owner),
  -- and the platform admin. Board visitors don't pass is_company_member.
  CREATE POLICY activity_logs_member_read ON public.activity_logs
    FOR SELECT TO authenticated
    USING (is_company_member(company_id) OR is_platform_admin());

  -- Written only by Colvy's server (lib/activity-logging.ts with the service
  -- role), so entries can't be forged, edited or deleted from the browser.
  REVOKE ALL ON public.activity_logs FROM anon, authenticated;
  GRANT SELECT ON public.activity_logs TO authenticated;
  GRANT ALL ON public.activity_logs TO service_role;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 4: anything ELSE that still lets the API roles write here ─────────
-- Should return no rows.
SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN ('team_members', 'activity_logs')
   AND grantee IN ('anon', 'authenticated')
   AND privilege_type <> 'SELECT';

-- ── STEP 5: confirm ─────────────────────────────────────────────────────────
-- Expect exactly: activity_logs_member_read (SELECT), team_members_read (SELECT),
-- both TO {authenticated}.
SELECT tablename, policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('team_members', 'activity_logs')
 ORDER BY tablename, policyname;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Only if staff lose access and it can't wait. The first block reopens the
-- hole this closes (anyone can make themselves an admin of any workspace) —
-- a stopgap only.
--
--   CREATE POLICY "Team members are viewable by everyone" ON public.team_members FOR SELECT USING (true);
--   CREATE POLICY "Anyone can manage team members" ON public.team_members FOR ALL USING (true);
--   GRANT ALL ON public.team_members TO anon, authenticated;
--
--   DROP POLICY IF EXISTS activity_logs_member_read ON public.activity_logs;
--   CREATE POLICY company_members_activity_logs ON public.activity_logs
--     FOR ALL TO authenticated
--     USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
--   GRANT ALL ON public.activity_logs TO authenticated;
--   NOTIFY pgrst, 'reload schema';
