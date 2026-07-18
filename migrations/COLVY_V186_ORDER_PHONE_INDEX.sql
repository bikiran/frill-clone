-- ============================================================
-- COLVY V186 — ORDER BILLING-PHONE INDEX (fast phone→order lookup)
--
-- SMS-only customers are matched to their orders by billing phone. Doing that
-- client-side (scan recent orders) is slow at volume. Store a normalised phone
-- (last 9 digits) on each order and index it so the inbox/profile can look up
-- a customer's orders by phone directly.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- Normalised billing phone (digits only, last 9) for indexed matching.
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS billing_phone_norm TEXT;

-- Backfill from existing billing JSONB.
UPDATE woocommerce_orders
SET billing_phone_norm = RIGHT(REGEXP_REPLACE(COALESCE(billing->>'phone',''), '\D', '', 'g'), 9)
WHERE billing_phone_norm IS NULL
  AND COALESCE(billing->>'phone','') <> '';

-- Index for fast lookups by company + normalised phone.
CREATE INDEX IF NOT EXISTS idx_woo_orders_company_phone
  ON woocommerce_orders (company_id, billing_phone_norm);

-- Also index the email lookups the inbox/profile use heavily.
CREATE INDEX IF NOT EXISTS idx_woo_orders_company_email
  ON woocommerce_orders (company_id, customer_email);

-- And normalised phone on customers for the same reason.
ALTER TABLE woocommerce_customers ADD COLUMN IF NOT EXISTS phone_norm TEXT;
UPDATE woocommerce_customers
SET phone_norm = RIGHT(REGEXP_REPLACE(COALESCE(phone,''), '\D', '', 'g'), 9)
WHERE phone_norm IS NULL AND COALESCE(phone,'') <> '';
CREATE INDEX IF NOT EXISTS idx_woo_customers_company_phone
  ON woocommerce_customers (company_id, phone_norm);

NOTIFY pgrst, 'reload schema';
