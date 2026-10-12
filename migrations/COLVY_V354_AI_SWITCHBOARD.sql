-- ============================================================
-- COLVY V354 — AI USAGE (the AI switchboard)
--
-- Which AI model does which job is now chosen in one place (Platform admin
-- → AI Models & Usage, saved in platform_settings under 'ai_models'), and
-- every AI call records the tokens it used here, so the same page shows AI
-- spend per business and per job. See lib/ai-models.ts.
--
-- Server only (service role): no policies, so nobody reads it with the
-- public key. Until this runs, Colvy simply skips recording — nothing breaks.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  job TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_company ON ai_usage (company_id, created_at DESC);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- ── platform_settings: anyone could change it ───────────────────────────
-- V220 let anyone with the public key insert or change platform_settings
-- (SMS pricing, and now the AI model choices). Keep reading open (campaign
-- cost estimates use the SMS pricing), but only the platform super admin may
-- change it. The server (service role) is unaffected.
DROP POLICY IF EXISTS "Anyone can manage platform_settings" ON platform_settings;
DROP POLICY IF EXISTS platform_settings_read ON platform_settings;
DROP POLICY IF EXISTS platform_settings_super_admin_write ON platform_settings;
CREATE POLICY platform_settings_read ON platform_settings FOR SELECT USING (true);
CREATE POLICY platform_settings_super_admin_write ON platform_settings FOR ALL
  USING ((auth.jwt() ->> 'email') = 'bishalstha76@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'bishalstha76@gmail.com');
