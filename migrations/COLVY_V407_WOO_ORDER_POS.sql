-- COLVY_V407 — remember which WooCommerce orders are Prexty POS sales.
--
-- Prexty pushes in-store sales into WooCommerce with order meta
-- _prexty_source = pos, _prexty_sale_id (e.g. R49966) and _prexty_outlet. The
-- WooCommerce webhook already reads them to skip the customer SMS, but nothing
-- kept them, so the inbox and the phone app couldn't tell an in-store sale from
-- a website order. The sync and the webhook now fill these columns; a full
-- WooCommerce Sync backfills older orders.
--
-- Safe to run twice. Until it runs, the sync and webhook write orders without
-- these columns, exactly as before.

ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS pos_source  TEXT;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS pos_sale_id TEXT;
ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS pos_outlet  TEXT;

NOTIFY pgrst, 'reload schema';
