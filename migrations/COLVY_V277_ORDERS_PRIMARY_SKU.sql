-- Adds primary_sku to orders for the Orders board's SKU column. Optional — the
-- sync tolerates its absence (it strips unknown columns and retries) — but with
-- this applied the SKU column is populated. Safe/idempotent.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS primary_sku TEXT;
