-- ============================================================
-- COLVY V329 — INTEGRATION SETTINGS PER BUSINESS
--
-- integration_configs (the Slack, Jira, Linear, Trello, Zapier, GitHub,
-- Intercom, Zendesk and Custom Webhook settings) had no company_id and one
-- row per integration for the whole platform, so every business saw and
-- overwrote the same settings. Each business now has its own rows, and the
-- table is server-only (the app reads and writes it through
-- /api/integrations/configs, which checks the caller belongs to the business).
--
-- Rows saved before this can't be traced to a business, so they're left
-- with no company (nobody sees them). Re-save those settings once.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE integration_configs ADD COLUMN IF NOT EXISTS company_id UUID;

-- Drop the platform-wide "one row per integration" rule, whatever it's named.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'integration_configs'::regclass
      AND con.contype = 'u'
      AND array_length(con.conkey, 1) = 1
      AND a.attname = 'integration_id'
  LOOP
    EXECUTE format('ALTER TABLE integration_configs DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS integration_configs_company_integration
  ON integration_configs (company_id, integration_id);

-- Server only: no policies, so the browser's anon key can't read anyone's
-- webhook URLs or API keys. (The service role bypasses RLS.)
ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can manage integrations" ON integration_configs;

NOTIFY pgrst, 'reload schema';
