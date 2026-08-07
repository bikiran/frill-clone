-- ============================================================
-- COLVY V219 — API / SERVER LOGS
-- An append-only stream of server-side warnings and errors from across the
-- API routes and libraries. Every log.warn / log.error in the app is mirrored
-- here (best-effort, fire-and-forget) so the Super Admin console can surface
-- what's actually failing in production without digging through Vercel logs.
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS api_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level        TEXT DEFAULT 'error',      -- error | warn | info
  source       TEXT,                      -- derived tag, e.g. telnyx, email, campaign
  message      TEXT,
  meta         JSONB,                     -- extra args / stack trace
  route        TEXT,                      -- request path when known
  company_id   UUID,                      -- when known
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_logs_created ON api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_level   ON api_logs(level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_source  ON api_logs(source, created_at DESC);

ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage api_logs" ON api_logs;
CREATE POLICY "Anyone can manage api_logs" ON api_logs FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
