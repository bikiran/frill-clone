-- ============================================================
-- COLVY V208 — AI USAGE LIMITS
--
-- The AI endpoints called a paid model with no authentication and no ceiling.
-- Anyone who found the URL could POST to them repeatedly and run up the bill.
-- This table records usage per company per day so a limit can be enforced, and
-- so spend is visible rather than only appearing on an invoice.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_usage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  day         DATE NOT NULL DEFAULT CURRENT_DATE,
  endpoint    TEXT NOT NULL DEFAULT 'ai',
  requests    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- One row per company/day/endpoint. A plain unique index (no partial
-- predicate) so it can be used for conflict handling safely.
CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_unique
  ON ai_usage (company_id, day, endpoint);
CREATE INDEX IF NOT EXISTS idx_ai_usage_day ON ai_usage (day DESC);

-- Per-company daily ceiling. NULL means "use the server default".
ALTER TABLE companies ADD COLUMN IF NOT EXISTS ai_daily_limit INTEGER;

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
-- Deliberately NOT "USING (true)": usage counters should only be touched by
-- the server (service role bypasses RLS). Clients have no reason to read or
-- write these, and letting them would defeat the limit.
DROP POLICY IF EXISTS "Anyone can manage ai_usage" ON ai_usage;
DROP POLICY IF EXISTS "No client access to ai_usage" ON ai_usage;
CREATE POLICY "No client access to ai_usage" ON ai_usage FOR SELECT USING (false);

NOTIFY pgrst, 'reload schema';
