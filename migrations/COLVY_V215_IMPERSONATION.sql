-- ============================================================
-- COLVY V215 — SAFE IMPERSONATION SESSIONS
-- Records every time a platform admin enters a customer workspace:
-- who, which business, why, in what mode, when it started and expires,
-- and when it ended. This is the audit trail behind the "you are viewing
-- X" banner. The admin keeps their OWN auth session — we never swap it —
-- so every action stays attributable to the real admin. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id      UUID,                          -- the platform admin (auth user)
  admin_email   TEXT,
  company_id    UUID,
  company_slug  TEXT,
  company_name  TEXT,
  reason        TEXT,                          -- required before entering
  mode          TEXT DEFAULT 'full',           -- read_only | full
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,                   -- auto-expiry
  ended_at      TIMESTAMPTZ                    -- set on explicit exit
);
CREATE INDEX IF NOT EXISTS idx_impersonation_company ON impersonation_sessions(company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_impersonation_admin ON impersonation_sessions(admin_id, started_at DESC);
ALTER TABLE impersonation_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages impersonation_sessions" ON impersonation_sessions;
CREATE POLICY "Service role manages impersonation_sessions" ON impersonation_sessions FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
