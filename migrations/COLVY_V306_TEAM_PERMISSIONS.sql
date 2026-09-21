-- ============================================================
-- COLVY V306 — TEAM MEMBER FEATURE PERMISSIONS
--
-- Adds a per-member feature-permission map so owners can restrict what each
-- editor/viewer can see and open (Feedback / Inbox / Orders / etc. suites and
-- the individual features inside them).
--
--   permissions : jsonb  — { "<featureKey>": true | false }
--                          NULL = unrestricted (existing members keep full
--                          access until the owner opts them into restrictions).
--                          Owners and admins always have full access regardless.
--
-- See lib/permissions.ts for the feature catalogue and the access helpers.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS permissions jsonb;

NOTIFY pgrst, 'reload schema';
