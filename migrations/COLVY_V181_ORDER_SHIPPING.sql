-- ============================================================
-- COLVY V181 — ORDER SHIPPING TOTAL
-- Store shipping so the profile order breakdown adds up to the order total.
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS shipping_total NUMERIC DEFAULT 0;
NOTIFY pgrst, 'reload schema';
