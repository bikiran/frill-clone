-- ============================================================
-- COLVY V186 — ORDER BILLING-PHONE INDEX (fast phone→order lookup)
--
-- SMS-only customers are matched to their orders by billing phone. Doing that
-- client-side (scanning recent orders) is slow at volume. This stores a
-- normalised phone (last 9 digits) on each order/customer and indexes it.
--
-- NOTE: this migration is self-sufficient. It creates any columns it depends on
-- (e.g. `billing`, which V176 adds) if they are missing, so it runs cleanly even
-- when earlier migrations were never applied.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- ── Dependencies from earlier migrations (created only if missing) ──────────
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS billing JSONB DEFAULT '{}'::jsonb;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE woocommerce_customers ADD COLUMN IF NOT EXISTS phone TEXT;

-- ── Orders: normalised billing phone ───────────────────────────────────────
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS billing_phone_norm TEXT;

UPDATE woocommerce_orders
SET billing_phone_norm = RIGHT(REGEXP_REPLACE(COALESCE(billing->>'phone',''), '\D', '', 'g'), 9)
WHERE billing_phone_norm IS NULL
  AND COALESCE(billing->>'phone','') <> '';

CREATE INDEX IF NOT EXISTS idx_woo_orders_company_phone
  ON woocommerce_orders (company_id, billing_phone_norm);

CREATE INDEX IF NOT EXISTS idx_woo_orders_company_email
  ON woocommerce_orders (company_id, customer_email);

-- ── Customers: normalised phone ────────────────────────────────────────────
ALTER TABLE woocommerce_customers ADD COLUMN IF NOT EXISTS phone_norm TEXT;

UPDATE woocommerce_customers
SET phone_norm = RIGHT(REGEXP_REPLACE(COALESCE(phone,''), '\D', '', 'g'), 9)
WHERE phone_norm IS NULL AND COALESCE(phone,'') <> '';

CREATE INDEX IF NOT EXISTS idx_woo_customers_company_phone
  ON woocommerce_customers (company_id, phone_norm);

NOTIFY pgrst, 'reload schema';
