-- ============================================================
-- COLVY V176 — ENSURE woocommerce_orders HAS THE EXPECTED COLUMNS
--
-- The live table was missing customer_email (the query 400'd with
-- "column woocommerce_orders.customer_email does not exist"), which
-- meant order history could never load by email. An earlier migration
-- defined it, but it clearly wasn't applied on this database — so add
-- it (and the other columns the order-history views rely on) idempotently.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS woo_customer_id BIGINT;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS order_date TIMESTAMPTZ;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS line_items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS billing JSONB DEFAULT '{}'::jsonb;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'AUD';
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS total NUMERIC DEFAULT 0;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS status TEXT;

-- Speed up the by-email lookup the inbox and profile do.
CREATE INDEX IF NOT EXISTS idx_woo_orders_email
  ON woocommerce_orders (company_id, lower(customer_email));

NOTIFY pgrst, 'reload schema';
