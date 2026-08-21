-- ============================================================
-- COLVY V280 — ORDER TAGS (managed, colour-coded)
--
-- A per-company palette of order tags with colours, so the Orders board can
-- offer a ShipStation-style Tag dropdown + Manage Tags dialog (create / rename /
-- recolour / delete). The tags actually applied to an order still live in
-- orders.tags (text[]) by NAME; this table is the palette + colour source.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS order_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL,
  name        TEXT NOT NULL,
  color       TEXT DEFAULT '#2563eb',
  created_at  TIMESTAMPTZ DEFAULT now()
);
-- One tag name per company (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_tags_company_name ON order_tags (company_id, lower(name));

ALTER TABLE order_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage order_tags" ON order_tags;
CREATE POLICY "Anyone can manage order_tags" ON order_tags FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
