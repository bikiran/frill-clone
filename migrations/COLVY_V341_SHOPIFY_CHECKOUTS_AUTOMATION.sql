-- ============================================================
-- COLVY V341 — SHOPIFY ABANDONED CHECKOUTS + ORDER AUTOMATION
--
-- Shopify reports a checkout the moment it starts — usually minutes before
-- the customer pays. Opening an "Abandoned cart" chat for every one would
-- bury the inbox in carts that were never abandoned. So checkouts land in
-- shopify_checkouts first; only one still unpaid after 15 minutes (and with
-- no order from that customer since) becomes an abandoned cart, through the
-- same path as WooCommerce carts (conversation, summary line, recovery
-- message, recovered revenue).
--
-- Order automation for Shopify records how Colvy contributed to an order on
-- the operational orders row, like woocommerce_orders.attribution.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS shopify_checkouts (
  company_id UUID NOT NULL,
  integration_id UUID,
  token TEXT NOT NULL,                 -- Shopify checkout token
  status TEXT NOT NULL DEFAULT 'open', -- open | completed | promoted | skipped
  email TEXT,
  phone TEXT,
  name TEXT,
  items JSONB DEFAULT '[]'::jsonb,     -- abandoned_carts item shape
  address JSONB,
  shipping JSONB,
  subtotal NUMERIC,
  total NUMERIC,
  currency TEXT,
  cart_url TEXT,                       -- Shopify's abandoned_checkout_url
  checkout_created_at TIMESTAMPTZ,
  checkout_updated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  promoted_at TIMESTAMPTZ,
  cart_id UUID,                        -- the abandoned_carts row it became
  skip_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (company_id, token)
);
CREATE INDEX IF NOT EXISTS idx_shopify_checkouts_due ON shopify_checkouts(status, checkout_updated_at) WHERE status = 'open';
-- Service role only: the inbox reads abandoned_carts, never this table.
ALTER TABLE shopify_checkouts ENABLE ROW LEVEL SECURITY;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS attribution TEXT;     -- cart_recovered | chat_order | chat_assisted
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attributed_at TIMESTAMPTZ;
ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS checkouts_synced_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
