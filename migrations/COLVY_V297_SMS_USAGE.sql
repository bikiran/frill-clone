-- ============================================================
-- COLVY V297 — SMS MONTHLY USAGE
--
-- Outbound SMS was unmetered: the pricing page includes 3,000 SMS/month on
-- the Inbox and Everything plans (and none on Free/Feedback), but nothing
-- counted or capped sends, so any workspace could text without limit — real
-- carrier spend with no ceiling. This table records SMS sent per company per
-- calendar month so the allowance can be enforced (see lib/sms-quota.ts).
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS sms_usage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  period      TEXT NOT NULL,              -- calendar month, 'YYYY-MM' (UTC)
  sent        INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- One row per company per month, for safe conflict handling.
CREATE UNIQUE INDEX IF NOT EXISTS sms_usage_unique
  ON sms_usage (company_id, period);
CREATE INDEX IF NOT EXISTS idx_sms_usage_period ON sms_usage (period DESC);

ALTER TABLE sms_usage ENABLE ROW LEVEL SECURITY;
-- Server-only: counters are written by the send path (service role bypasses
-- RLS). Clients have no reason to read or write them, and letting them would
-- defeat the cap.
DROP POLICY IF EXISTS "No client access to sms_usage" ON sms_usage;
CREATE POLICY "No client access to sms_usage" ON sms_usage FOR SELECT USING (false);

NOTIFY pgrst, 'reload schema';
