-- Adds customer_note to the operational orders table — the note a customer
-- leaves at checkout (WooCommerce order.customer_note), shown on the packing
-- slip. Optional: the orders sync strips unknown columns and retries, so it
-- works with or without this, but with it applied the note is stored. New/updated
-- orders populate it via the webhook. Safe/idempotent.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_note TEXT;
