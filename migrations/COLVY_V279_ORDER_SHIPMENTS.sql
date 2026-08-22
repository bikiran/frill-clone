-- ============================================================
-- COLVY V279 — ORDER SHIPMENTS (Orders & Fulfillment)
--
-- The Orders module needs its own shipments table. The name `shipments` was
-- already taken by V206 (customer tracking-link history, with order_id TEXT and
-- no label/cost/status columns), so V275's `CREATE TABLE IF NOT EXISTS shipments`
-- was a no-op and Create Label failed with "unresolved unknown columns".
--
-- This table is dedicated to fulfilment shipments (labels) created from the
-- Orders board, and `tracking_events` is repointed at it.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS order_shipments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  company_id       UUID NOT NULL,
  carrier          TEXT,
  service          TEXT,
  tracking_number  TEXT,
  tracking_url     TEXT,
  label_url        TEXT,
  status           TEXT DEFAULT 'created',   -- created | label_purchased | in_transit | delivered | cancelled
  cost             NUMERIC,
  currency         TEXT DEFAULT 'AUD',
  weight_grams     INT,
  parcel           JSONB,                    -- {length,width,height} in cm
  provider_ref     TEXT,                     -- the carrier's shipment id
  created_by       UUID,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_shipments_order ON order_shipments (order_id);
CREATE INDEX IF NOT EXISTS idx_order_shipments_company ON order_shipments (company_id, created_at DESC);

-- Repoint tracking_events (introduced in V275, empty) at order_shipments.
DROP TABLE IF EXISTS tracking_events;
CREATE TABLE tracking_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id  UUID NOT NULL REFERENCES order_shipments(id) ON DELETE CASCADE,
  order_id     UUID,
  company_id   UUID NOT NULL,
  status       TEXT,
  description  TEXT,
  location     TEXT,
  occurred_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tracking_events_shipment ON tracking_events (shipment_id);

-- Permissive RLS (company-scoped in queries — matches the other operational tables).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['order_shipments','tracking_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Anyone can manage %1$s" ON %1$s', t);
    EXECUTE format('CREATE POLICY "Anyone can manage %1$s" ON %1$s FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
