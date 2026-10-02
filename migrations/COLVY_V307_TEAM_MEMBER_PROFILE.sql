-- ============================================================
-- COLVY V307 — OWNER-EDITABLE TEAM MEMBER PROFILE
--
-- Lets the owner set a display name and profile photo for a team member from the
-- Team page, overriding whatever the member has on their own account. These
-- values take priority anywhere the app resolves a member's name/avatar (via
-- /api/team/names), so an owner-set name/photo shows across the inbox, read
-- receipts, etc.
--
--   name       : text  — already used as a display-name override (added here
--                        IF NOT EXISTS in case an older DB never created it).
--   avatar_url : text  — owner-set profile photo URL.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS name text;

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS avatar_url text;

NOTIFY pgrst, 'reload schema';
