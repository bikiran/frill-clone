-- COLVY V259 — PREXTY INTEGRATIONS
--
-- Per-company connection to Prexty (the POS). "One key per business": the API
-- key grants whole-business access, and each order the API returns carries an
-- `outlet_id` we later map to the company's Colvy outlets/locations. This is the
-- config foundation — pulling orders into the chat lands once Prexty's
-- /api/v1/orders endpoint is live.
--
-- Mirrors woocommerce_integrations but simpler: a single API key + base URL (no
-- consumer key/secret pair), and ONE row per company (unique company_id) rather
-- than multi-store.

CREATE TABLE IF NOT EXISTS prexty_integrations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  base_url       TEXT NOT NULL DEFAULT 'https://prexty.com',  -- API host, no trailing slash
  api_key        TEXT NOT NULL,                                -- sent in the X-Prexty request header
  store_name     TEXT,                                         -- display label
  is_active      BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Whole-business key ⇒ at most one Prexty connection per company.
CREATE UNIQUE INDEX IF NOT EXISTS prexty_company_uniq ON prexty_integrations(company_id);

ALTER TABLE prexty_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage prexty_integrations" ON prexty_integrations;
CREATE POLICY "Anyone can manage prexty_integrations" ON prexty_integrations FOR ALL USING (true);
