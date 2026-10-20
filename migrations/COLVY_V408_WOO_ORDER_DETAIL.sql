-- COLVY_V408 — keep the whole invoice on each WooCommerce order.
--
-- Opening an order fetched it live once (payment method, tax, discount, fees,
-- notes) but saved only the items and shipping, so every later open showed a
-- bare subtotal and total. `detail` holds the rest — including every field
-- Prexty POS adds (_prexty_*) — and is filled by the sync, the webhook and the
-- first live open. A full WooCommerce Sync backfills older orders.
--
-- Safe to run twice. Until it runs, orders are written without it, as before.

ALTER TABLE woocommerce_orders ADD COLUMN IF NOT EXISTS detail JSONB;

NOTIFY pgrst, 'reload schema';
