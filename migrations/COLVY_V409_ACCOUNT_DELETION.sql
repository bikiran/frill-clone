-- COLVY_V409 — deleting your account (App Store guideline 5.1.1(v)).
--
-- A user can delete their account from the app or the web
-- (POST /api/account/delete). Their login is deleted at once. A workspace they
-- OWN is closed at the same time — staff are locked out, its numbers stop
-- routing calls and texts, its subscription is cancelled — and all its data is
-- erased 30 days later by /api/cron/purge-closed-accounts. Until then it can be
-- restored on request. Tax invoices, credit notes and billing ledgers are kept,
-- as the law requires.
--
-- Safe to run twice.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS closed_at    TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS purge_after  TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS closed_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_companies_purge_after ON companies (purge_after) WHERE purge_after IS NOT NULL;

-- One row per deletion: what was done, so a closed workspace can be restored
-- within the 30 days and the purge is recorded.
CREATE TABLE IF NOT EXISTS account_deletions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  email        TEXT,
  company_ids  UUID[] NOT NULL DEFAULT '{}',
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  purge_after  TIMESTAMPTZ,
  purged_at    TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'closed'
);
ALTER TABLE account_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_deletions FROM anon, authenticated;
GRANT ALL ON account_deletions TO service_role;

NOTIFY pgrst, 'reload schema';
