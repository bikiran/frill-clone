-- ============================================================
-- COLVY V358 — AI USAGE LOG (fixes V354)
--
-- V354 meant to create ai_usage for the AI switchboard (one row per AI call:
-- job, model, tokens). But V208 had already created a table called ai_usage
-- for the AI rate limit (one counter row per company per day), so V354's
-- CREATE TABLE IF NOT EXISTS did nothing: usage was never recorded and
-- Platform admin → AI models kept asking for V354.
--
-- The switchboard now logs to its own table, ai_usage_log. V208's ai_usage
-- (the rate limit) is untouched.
--
-- Server only (service role): RLS on, no policies, so nobody reads it with
-- the public key. Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  job TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created ON ai_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_company ON ai_usage_log (company_id, created_at DESC);
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
