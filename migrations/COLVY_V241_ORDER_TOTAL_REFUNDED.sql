-- ============================================================
-- COLVY V241 — TRACK REFUNDED TOTAL ON SYNCED ORDERS
-- Stores how much has been refunded on an order so the inbox order panel can
-- show "Partially refunded / Refunded" and the amount even before the live
-- WooCommerce refetch lands. WooCommerce keeps a partial-refund order at status
-- "completed", so status alone can't convey it. Additive, safe to re-run.
-- ============================================================

ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS total_refunded numeric NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
