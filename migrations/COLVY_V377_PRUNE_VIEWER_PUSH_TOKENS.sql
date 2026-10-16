-- ============================================================
-- COLVY V377 — BOARD VISITORS' PHONES STOP GETTING STAFF ALERTS
--
-- push_tokens holds one row per phone per workspace, and /api/push/send sends
-- a workspace's alerts (new messages with a preview, orders, calls, tasks) to
-- every row for that workspace. Registering a phone (claim_push_token, V221/
-- V222) checks is_company_member, and before V337 that accepted ANY
-- team_members row — so a board visitor (role 'viewer') who opened the mobile
-- app could register their phone with a business and has been getting its
-- message previews ever since. V337 stopped new registrations; the old rows
-- are still there.
--
-- The code now sends to staff only (lib/feature-access.ts filterUsersByFeature,
-- branch claude/fix-team-leftovers), so this is tidying, not the fix: it
-- deletes every token whose user is not staff of that row's workspace, with
-- V337's definition of staff —
--   • the workspace's owner (companies.owner_id), or
--   • a team_members row there whose role is not 'viewer' and whose status is
--     not 'removed' (either in any case; a blank role is the column's default,
--     'editor').
-- A row with no workspace belongs to no one and goes too (V220 already cleared
-- those once). Real staff keep every phone they have registered.
--
-- ── BEFORE RUNNING ──────────────────────────────────────────────────────────
-- Nothing to deploy first: the code works with or without this. Step 1 shows
-- what is about to go.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. Step 1 again returns no rows.
--   2. An owner, an admin and an agent still get a push for a new message.
--
-- Run in the Supabase SQL editor. Safe to re-run (a second run deletes
-- nothing). There's no rollback: a deleted token comes back the next time its
-- owner opens the app, if they're still allowed one.
-- ============================================================

-- ── STEP 1: what is about to go (no table, no rows) ────────────────────────
--   SELECT c.name AS workspace, p.user_id, p.platform, p.updated_at
--     FROM push_tokens p LEFT JOIN companies c ON c.id = p.company_id
--    WHERE NOT EXISTS (SELECT 1 FROM companies o WHERE o.id = p.company_id AND o.owner_id = p.user_id)
--      AND NOT EXISTS (SELECT 1 FROM team_members tm
--                       WHERE tm.company_id = p.company_id AND tm.user_id = p.user_id
--                         AND lower(COALESCE(tm.status, 'active')) <> 'removed'
--                         AND lower(COALESCE(tm.role, '')) <> 'viewer')
--    ORDER BY 1, 2;

-- ── STEP 2: delete them ─────────────────────────────────────────────────────
DO $$
DECLARE n INTEGER;
BEGIN
  IF to_regclass('public.push_tokens') IS NULL THEN
    RAISE NOTICE 'V377: no push_tokens table, nothing to do';
    RETURN;
  END IF;

  DELETE FROM public.push_tokens p
   WHERE NOT EXISTS (
           SELECT 1 FROM public.companies o
            WHERE o.id = p.company_id AND o.owner_id = p.user_id)
     AND NOT EXISTS (
           SELECT 1 FROM public.team_members tm
            WHERE tm.company_id = p.company_id
              AND tm.user_id = p.user_id
              AND lower(COALESCE(tm.status, 'active')) <> 'removed'
              AND lower(COALESCE(tm.role, '')) <> 'viewer');
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'V377: removed % push token(s) that belonged to no staff member', n;
END $$;
