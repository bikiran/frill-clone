-- ============================================================
-- COLVY V330 — INTEGRATION DELIVERY LOG
--
-- Every time Colvy sends an event to an integration (Slack, webhook,
-- Zapier, Jira, Linear, Trello, GitHub, Zendesk, Intercom) it records
-- the outcome here, so the settings page can show "sent / failed and
-- why", with a link to what was created (issue, card, ticket).
--
-- Server only (no RLS policies). Needs V329. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS integration_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  integration_id TEXT NOT NULL,
  event TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL,          -- sent | failed | skipped
  http_status INT,
  error TEXT,
  ref_url TEXT,                  -- the issue / card / ticket it created
  dedupe_key TEXT,
  test BOOLEAN NOT NULL DEFAULT false,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_deliveries_recent
  ON integration_deliveries (company_id, integration_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_deliveries_dedupe
  ON integration_deliveries (company_id, integration_id, dedupe_key, created_at DESC)
  WHERE dedupe_key IS NOT NULL;

ALTER TABLE integration_deliveries ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
