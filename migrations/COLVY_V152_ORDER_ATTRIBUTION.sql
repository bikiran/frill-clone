-- ============================================================
-- COLVY V152 — CHAT-ATTRIBUTED ORDER REVENUE
-- Links orders back to the Colvy conversation that produced them, so
-- "sales converted through chat" is a real, defensible revenue figure
-- rather than an estimate. Safe to re-run.
-- ============================================================

-- Which conversation (if any) this order came from, and how we know.
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS conversation_id UUID;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS attribution TEXT;
--   attribution values:
--     'chat_order'      → the agent created the order from the chat
--     'cart_recovered'  → an abandoned cart Colvy captured later converted
--     'chat_assisted'   → the customer had an open chat before ordering

ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS attributed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_woo_orders_attr
  ON woocommerce_orders(company_id, attribution, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_woo_orders_conv
  ON woocommerce_orders(company_id, conversation_id);

NOTIFY pgrst, 'reload schema';
