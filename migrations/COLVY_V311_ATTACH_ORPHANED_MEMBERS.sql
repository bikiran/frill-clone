-- ============================================================
-- COLVY V311 — attach orphaned accounts to Roxy Aquarium
--
-- Logan McalpIn (loganmcalpin123@gmail.com) and Dip Bhakta
-- (dipbhakta2015@gmail.com) were created as accounts but never linked to a
-- workspace, so they show in the platform Users list but not in Roxy Aquarium's
-- team (the team list filters team_members by company_id, and they had no such
-- row). This backfills their membership as Agent (role 'editor', which the team
-- UI labels "Agent"), active.
--
-- Idempotent: skips anyone who already has a membership row for the workspace,
-- and no-ops if an account or the workspace can't be found. Run in the Supabase
-- SQL editor. Safe to re-run.
-- ============================================================

INSERT INTO team_members (user_id, company_id, email, role, status)
SELECT u.id, c.id, u.email, 'editor', 'active'
FROM auth.users u
CROSS JOIN companies c
WHERE c.slug = 'roxyaquarium'
  AND lower(u.email) IN ('loganmcalpin123@gmail.com', 'dipbhakta2015@gmail.com')
  AND NOT EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.company_id = c.id AND tm.user_id = u.id
  );

NOTIFY pgrst, 'reload schema';
