-- ============================================================
-- COLVY V141 — TEAM MEMBERS COMPANY SCOPE
-- Ensures team_members can be linked to a company (needed by the
-- team invite flow). Safe to re-run.
-- ============================================================

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS company_id UUID;
CREATE INDEX IF NOT EXISTS idx_team_members_company ON team_members(company_id);

NOTIFY pgrst, 'reload schema';
