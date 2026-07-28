-- ============================================================
-- COLVY V148 — TEAM MEMBERS: joined_at + per-company email
-- Adds the joined_at column used when a member accepts an invite,
-- and relaxes the global UNIQUE(email) so the same person can be a
-- member of more than one company (and be re-invited after removal).
-- Safe to re-run.
-- ============================================================

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS company_id UUID;

-- Drop the old global unique-on-email constraint if present (name can vary).
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'team_members'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE team_members DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- Also drop any unique index directly on (email).
DROP INDEX IF EXISTS team_members_email_key;

-- Enforce uniqueness per company instead (one membership row per email+company).
CREATE UNIQUE INDEX IF NOT EXISTS team_members_email_company_uniq
  ON team_members (lower(email), company_id);

NOTIFY pgrst, 'reload schema';
