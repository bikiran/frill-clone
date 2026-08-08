-- ============================================================
-- COLVY V224 — WOOCOMMERCE_ORDERS SCHEMA BACKFILL
-- The live woocommerce_orders table predates several migrations (it was created
-- before V176/V181/V152/V186 with CREATE TABLE IF NOT EXISTS, so their ALTERs
-- never took on this DB). As a result columns the app writes — notably
-- `currency` — are missing, and PostgREST rejects order inserts (PGRST204),
-- silently dropping order fields on real WooCommerce syncs and blocking the demo
-- seeder. This consolidates every expected column so the table matches the code.
--
-- Fully idempotent (ADD COLUMN IF NOT EXISTS) and safe to re-run.
-- ============================================================

-- Core order fields (from the base table + V176).
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS woo_order_id       INTEGER;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS woo_customer_id    BIGINT;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS customer_email     TEXT;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS status             TEXT;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS total              NUMERIC DEFAULT 0;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS currency           TEXT DEFAULT 'AUD';
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS order_date         TIMESTAMPTZ;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS line_items         JSONB DEFAULT '[]'::jsonb;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS billing            JSONB DEFAULT '{}'::jsonb;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ DEFAULT NOW();

-- Shipping (V181).
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS shipping_total     NUMERIC DEFAULT 0;

-- Link + attribution (V152).
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS conversation_id    UUID;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS attribution        TEXT;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS attributed_at      TIMESTAMPTZ;

-- Normalised billing phone for fast phone→order lookup (V186).
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS billing_phone_norm TEXT;
UPDATE woocommerce_orders
SET billing_phone_norm = RIGHT(REGEXP_REPLACE(COALESCE(billing->>'phone',''), '\D', '', 'g'), 9)
WHERE billing_phone_norm IS NULL AND COALESCE(billing->>'phone','') <> '';

CREATE INDEX IF NOT EXISTS idx_woo_orders_company_phone ON woocommerce_orders (company_id, billing_phone_norm);
CREATE INDEX IF NOT EXISTS idx_woo_orders_company_email ON woocommerce_orders (company_id, customer_email);
CREATE INDEX IF NOT EXISTS idx_woo_orders_customer      ON woocommerce_orders (company_id, woo_customer_id);

-- Customers table normalised phone (V186), created only if the table exists.
ALTER TABLE woocommerce_customers ADD COLUMN IF NOT EXISTS phone      TEXT;
ALTER TABLE woocommerce_customers ADD COLUMN IF NOT EXISTS phone_norm TEXT;
UPDATE woocommerce_customers
SET phone_norm = RIGHT(REGEXP_REPLACE(COALESCE(phone,''), '\D', '', 'g'), 9)
WHERE phone_norm IS NULL AND COALESCE(phone,'') <> '';
CREATE INDEX IF NOT EXISTS idx_woo_customers_company_phone ON woocommerce_customers (company_id, phone_norm);

-- Refresh the PostgREST schema cache so the new columns are visible immediately.
NOTIFY pgrst, 'reload schema';
