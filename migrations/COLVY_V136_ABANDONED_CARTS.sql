-- ============================================================
-- COLVY V136 — ABANDONED CARTS
-- WooCommerce core does NOT track abandoned carts and has no API
-- for them. So Colvy exposes a receiver endpoint that the store
-- (via a plugin webhook or a small checkout snippet) pushes cart
-- data to. We store it and surface it in the chat so staff can see
-- what the customer wanted and convert it into an order.
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS abandoned_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  integration_id UUID,                 -- which WooCommerce store (optional)
  external_id TEXT,                     -- cart id in the source system (optional)
  -- Customer
  name TEXT,
  email TEXT,
  phone TEXT,
  address JSONB,                        -- { address_1, city, state, postcode, country }
  -- Cart contents
  items JSONB,                          -- [{ product_id, variation_id, name, sku, quantity, price }]
  coupon TEXT,
  shipping JSONB,                       -- { method, label, cost }
  notes TEXT,
  subtotal NUMERIC,
  total NUMERIC,
  currency TEXT DEFAULT 'AUD',
  -- Lifecycle
  status TEXT DEFAULT 'abandoned',      -- abandoned | recovered | dismissed
  recovered_order_id BIGINT,
  conversation_id UUID,
  cart_url TEXT,                        -- recovery/checkout link if provided
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_abandoned_company ON abandoned_carts(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_abandoned_email ON abandoned_carts(company_id, email);
CREATE INDEX IF NOT EXISTS idx_abandoned_phone ON abandoned_carts(company_id, phone);
-- Same external cart shouldn't duplicate on repeated pushes.
CREATE UNIQUE INDEX IF NOT EXISTS abandoned_ext_uniq ON abandoned_carts(company_id, external_id) WHERE external_id IS NOT NULL;

ALTER TABLE abandoned_carts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage abandoned_carts" ON abandoned_carts;
CREATE POLICY "Anyone can manage abandoned_carts" ON abandoned_carts FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
