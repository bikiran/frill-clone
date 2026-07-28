-- ============================================================
-- COLVY V196 — SMS PRICING
--
-- Per-company SMS pricing so campaign cost estimates are real rather than a
-- placeholder. Prices are stored GST-INCLUSIVE in AUD, which is how they're
-- quoted to the customer; the ex-GST figure is derived for reporting.
--
-- The underlying carrier cost is stored in USD (Telnyx bills in USD) alongside
-- the FX rate used, so margin can be shown honestly and re-checked when the
-- rate moves.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS sms_pricing (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL,

  -- What we charge, per SMS part, GST inclusive, in AUD.
  price_per_part     NUMERIC(10,4) NOT NULL DEFAULT 0.1500,
  currency           TEXT NOT NULL DEFAULT 'AUD',
  gst_rate           NUMERIC(5,4) NOT NULL DEFAULT 0.10,
  gst_inclusive      BOOLEAN NOT NULL DEFAULT TRUE,

  -- What it costs us, per part, in the carrier's currency.
  carrier_cost       NUMERIC(10,4) NOT NULL DEFAULT 0.0500,
  carrier_currency   TEXT NOT NULL DEFAULT 'USD',
  -- AUD per 1 unit of carrier currency is derived from this rate:
  -- cost_aud = carrier_cost / fx_rate
  fx_rate            NUMERIC(10,4) NOT NULL DEFAULT 0.6500,
  fx_updated_at      TIMESTAMPTZ,

  -- Volume discounts. [{ "min": 500, "price": 0.13 }, ...] — price is per part,
  -- GST inclusive, applied when a single campaign has at least `min` parts.
  volume_tiers       JSONB NOT NULL DEFAULT '[]'::jsonb,

  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_pricing_company
  ON sms_pricing (company_id);

ALTER TABLE sms_pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sms_pricing_all ON sms_pricing;
CREATE POLICY sms_pricing_all ON sms_pricing
  FOR ALL USING (true) WITH CHECK (true);

-- Seed a default row for every company that doesn't have one.
-- Standard A$0.15/part inc GST, easing to A$0.105 at volume.
INSERT INTO sms_pricing (company_id, price_per_part, carrier_cost, fx_rate, volume_tiers)
SELECT c.id, 0.1500, 0.0500, 0.6500,
  '[{"min":500,"price":0.130},{"min":2000,"price":0.115},{"min":5000,"price":0.105}]'::jsonb
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM sms_pricing p WHERE p.company_id = c.id);

-- Record what a campaign was actually charged at, so later price changes don't
-- rewrite the history of past sends.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS price_per_part NUMERIC(10,4);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS cost_currency  TEXT DEFAULT 'AUD';

NOTIFY pgrst, 'reload schema';
