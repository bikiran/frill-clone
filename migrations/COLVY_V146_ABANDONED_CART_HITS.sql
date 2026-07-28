-- ============================================================
-- COLVY V146 — ABANDONED CART HIT LOG (diagnostic)
-- Records every inbound POST to /api/abandoned-carts (even rejected
-- ones) so ?diag=1 can tell whether the WooCommerce bridge is
-- actually reaching Colvy. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS abandoned_cart_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  had_email BOOLEAN DEFAULT false,
  had_phone BOOLEAN DEFAULT false,
  item_count INT DEFAULT 0,
  raw_keys TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ac_hits_company ON abandoned_cart_hits(company_id, created_at DESC);
ALTER TABLE abandoned_cart_hits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage ac_hits" ON abandoned_cart_hits;
CREATE POLICY "Anyone can manage ac_hits" ON abandoned_cart_hits FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
