-- ============================================================
-- COLVY V308 — TEAM MEMBER DEPARTMENT / TEAM
--
-- Separates "what a member is allowed to do" (role + permissions) from "what
-- they do" (their department / function). This field is organisational only —
-- it does NOT affect access — and is meant for grouping, reporting and future
-- conversation routing (e.g. send Support enquiries to the Support team).
--
--   department : text  — e.g. Sales, Support, Fulfillment, Front Desk,
--                        Marketing, Management, or a custom value. NULL = unset.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS department text;

NOTIFY pgrst, 'reload schema';
