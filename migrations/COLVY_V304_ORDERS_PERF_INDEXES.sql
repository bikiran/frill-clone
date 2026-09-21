-- ============================================================
-- COLVY V304 — ORDERS PERFORMANCE INDEXES
--
-- Two hot paths on the Orders board were doing unindexed scans:
--   • The order sync sorts woocommerce_orders by (company_id, order_date) on
--     every board open, but only (company_id, email/phone/woo_customer_id)
--     were indexed — so the sort scanned the whole per-company set.
--   • The product-search index pages order_items by company_id, which was only
--     indexed by order_id — a full-table scan filtered in memory.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_woo_orders_company_date
  ON woocommerce_orders (company_id, order_date DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_company
  ON order_items (company_id);

NOTIFY pgrst, 'reload schema';
