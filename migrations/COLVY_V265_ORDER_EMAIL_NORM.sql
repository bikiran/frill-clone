-- COLVY V265 — INDEX-BACKED ORDER-BY-EMAIL LOOKUP
--
-- The inbox Order History panel matched a contact's orders with a
-- case-insensitive ILIKE on customer_email. ILIKE can't use the plain
-- (company_id, customer_email) btree index, so every lookup scanned all of the
-- company's orders and sorted them — the "always slow" order history.
--
-- Add a normalised (lower-cased) email column, computed automatically, and an
-- index on (company_id, customer_email_norm). The client then matches with an
-- exact eq the index serves directly. STORED generated columns are populated
-- for existing rows as part of the ALTER, so no separate backfill is needed.
-- The app falls back to the old ILIKE path until this runs, so deploying the
-- code before the migration is safe — it just stays slow until applied.

ALTER TABLE woocommerce_orders
  ADD COLUMN IF NOT EXISTS customer_email_norm TEXT
  GENERATED ALWAYS AS (lower(customer_email)) STORED;

CREATE INDEX IF NOT EXISTS idx_woo_orders_company_email_norm
  ON woocommerce_orders (company_id, customer_email_norm);
