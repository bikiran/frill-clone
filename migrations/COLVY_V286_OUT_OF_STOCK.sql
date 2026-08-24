-- ============================================================
-- COLVY V286 — OUT-OF-STOCK ITEM ALERTS
-- Staff can flag individual order line items as out of stock from the order
-- drawer. Each flag is denormalised with the order + customer + product detail
-- it needs, so the "Out of Stock List" view is a single cheap query with
-- filters — no re-joining order_items or recomputing line keys per order.
--
-- A flag is keyed on (order_id, line_key) — the SAME stable line key the
-- fulfilment panel uses (prefers the WooCommerce line id, else
-- product|sku|occurrence) — so it survives the webhook re-inserting items.
--
-- status: 'pending' (waiting on stock) → 'resolved' (restocked / shipped).
-- The list also treats an alert as done when its order has shipped/cancelled,
-- so a sent order clears the list even if nobody flipped the status by hand.
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS order_stock_alerts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL,
  order_id          UUID NOT NULL,
  order_number      TEXT,
  order_date        TIMESTAMPTZ,
  customer_name     TEXT,
  customer_phone    TEXT,
  customer_email    TEXT,
  store_location_id UUID,
  line_key          TEXT NOT NULL,
  product_name      TEXT,
  sku               TEXT,
  quantity          INTEGER DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'resolved'
  note              TEXT,
  created_by        UUID,
  created_by_name   TEXT,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, line_key)
);

CREATE INDEX IF NOT EXISTS idx_stock_alerts_company_status ON order_stock_alerts (company_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_order ON order_stock_alerts (order_id);

ALTER TABLE order_stock_alerts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY order_stock_alerts_all ON order_stock_alerts FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
