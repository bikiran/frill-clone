-- ============================================================
-- COLVY V180 — CONVERSATION CART/ORDER RECOVERY FLAGS
--
-- When an abandoned cart is recovered, the conversation needs to carry
-- the order status and a recovered flag so the inbox badge flips from
-- "Abandoned Cart" to the order status. These columns were read by the
-- UI but never guaranteed to exist.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS cart_status TEXT;   -- e.g. 'recovered'
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS woo_order_id TEXT;  -- the order that recovered the cart

NOTIFY pgrst, 'reload schema';
