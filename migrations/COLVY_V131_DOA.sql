-- ============================================================
-- COLVY V131 — DOA (Dead On Arrival) CLAIMS
-- Tracks a claim against an order: refund / store credit / coupon.
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS doa_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  conversation_id UUID,
  contact_id UUID,

  order_number TEXT,
  order_id BIGINT,                        -- WooCommerce order id
  customer_email TEXT,
  customer_name TEXT,
  customer_phone TEXT,

  order_snapshot JSONB,                   -- full order at claim time (items, totals)
  selected_items JSONB,                   -- items chosen to refund
  notes TEXT,

  resolution TEXT,                        -- refund | store_credit | coupon | resend
  refund_amount NUMERIC,
  refund_id BIGINT,                       -- WooCommerce refund id
  coupon_code TEXT,
  status TEXT DEFAULT 'open',             -- open | refunded | credited | resent | closed
  error TEXT,

  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doa_company ON doa_claims(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doa_conversation ON doa_claims(conversation_id);
ALTER TABLE doa_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage doa_claims" ON doa_claims;
CREATE POLICY "Anyone can manage doa_claims" ON doa_claims FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
