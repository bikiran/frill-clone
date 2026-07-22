-- ============================================================
-- COLVY V206 — SHIPMENT TRACKING
--
-- Records each tracking link sent to a customer, so the conversation keeps a
-- history of what was dispatched, with which carrier, and whether the customer
-- opened the link (via the Colvy short link's click count).
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS shipments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id  UUID,
  contact_id       UUID,
  order_id         TEXT,
  carrier          TEXT,          -- auspost | aramex | tge | manual
  carrier_label    TEXT,
  tracking_number  TEXT,
  tracking_url     TEXT,          -- the carrier URL we point at
  short_code       TEXT,          -- the Colvy short link code (for click counts)
  sent_by          TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipments_conversation
  ON shipments (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipments_company
  ON shipments (company_id, created_at DESC);

ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage shipments" ON shipments;
CREATE POLICY "Anyone can manage shipments" ON shipments FOR ALL USING (true);

-- Mark the short link as a tracking link so link reports can group them.
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS link_type TEXT;

NOTIFY pgrst, 'reload schema';
