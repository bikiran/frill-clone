-- ============================================================
-- COLVY V282 — ORDER LINE FULFILLMENTS + SPLIT SHIPMENTS
--
-- Per-line-item "sent/fulfilled" state and ShipStation-style split shipments
-- for the Orders board.
--
-- Kept in its OWN table rather than on order_items because the WooCommerce
-- webhook (upsertWooOrder) deletes and re-inserts a whole order's items on any
-- update — which regenerates order_items.id and would wipe every flag. Instead
-- we key on a STABLE `line_key`:
--   • `w:<woo_line_id>`  when the WooCommerce line id is known (sync now stores
--     it in order_items.metadata.woo_line_id), or
--   • `k:<product_id>|<sku>|<occurrence>`  as a re-sync-proof fallback.
--
-- ship_group is the split-shipment number (1 = the default/first shipment).
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS order_fulfillments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL,
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  line_key     TEXT NOT NULL,
  sent         BOOLEAN NOT NULL DEFAULT false,
  sent_at      TIMESTAMPTZ,
  ship_group   SMALLINT NOT NULL DEFAULT 1,
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (order_id, line_key)
);
CREATE INDEX IF NOT EXISTS idx_order_fulfillments_order ON order_fulfillments (order_id);
CREATE INDEX IF NOT EXISTS idx_order_fulfillments_company ON order_fulfillments (company_id);

-- Permissive RLS (company-scoped in queries — matches the other operational tables).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['order_fulfillments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Anyone can manage %1$s" ON %1$s', t);
    EXECUTE format('CREATE POLICY "Anyone can manage %1$s" ON %1$s FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
