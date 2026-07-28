-- ============================================================
-- COLVY V192 — LINK ANALYTICS: TYPE, OUTLET, CONVERSION ATTRIBUTION
--
-- Extends the link tracking from V189 so the Reports tab can answer:
--   what kind of link was it, which outlet sent it, who clicked, and did that
--   click lead to an order.
--
-- ATTRIBUTION MODEL (important, so the numbers are interpretable):
--   Orders are attributed to a link by CONTACT + TIME WINDOW — if a contact
--   clicked a link and that same contact placed an order within the attribution
--   window (default 7 days), the order is credited to that link. This is
--   last-touch attribution by contact. It cannot see anonymous browsing and it
--   will over-credit if a customer would have ordered anyway, so treat it as
--   "revenue influenced", not "revenue caused".
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- ── Link classification + outlet ───────────────────────────────────────────
-- product / image / help / form / checkout / booking / payment / external
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS link_type   TEXT;
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS location_id UUID;
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS sent_by_id  UUID;

CREATE INDEX IF NOT EXISTS idx_short_links_company_type
  ON short_links (company_id, link_type);
CREATE INDEX IF NOT EXISTS idx_short_links_contact
  ON short_links (company_id, contact_id);

-- ── Clicks: identify the person, not just the hit ──────────────────────────
-- contact_id is copied from the link at click time so "unique clicks"
-- (distinct recipients) can be computed without a join.
ALTER TABLE link_clicks ADD COLUMN IF NOT EXISTS contact_id UUID;

CREATE INDEX IF NOT EXISTS idx_link_clicks_contact
  ON link_clicks (company_id, contact_id);

-- ── Conversions attributed to a link ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS link_conversions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL,
  link_id       UUID NOT NULL,
  contact_id    UUID,
  order_id      TEXT,                 -- WooCommerce order id
  order_number  TEXT,
  stage         TEXT NOT NULL,        -- cart / checkout / created / paid
  revenue       NUMERIC(12,2) DEFAULT 0,
  currency      TEXT DEFAULT 'AUD',
  clicked_at    TIMESTAMPTZ,          -- the click being credited
  converted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per link+order+stage, so re-running attribution can't double count.
CREATE UNIQUE INDEX IF NOT EXISTS idx_link_conversions_unique
  ON link_conversions (link_id, order_id, stage);

CREATE INDEX IF NOT EXISTS idx_link_conversions_company
  ON link_conversions (company_id, converted_at DESC);
CREATE INDEX IF NOT EXISTS idx_link_conversions_link
  ON link_conversions (link_id);

ALTER TABLE link_conversions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS link_conversions_all ON link_conversions;
CREATE POLICY link_conversions_all ON link_conversions
  FOR ALL USING (true) WITH CHECK (true);

-- ── Backfill link_type for links already sent ──────────────────────────────
UPDATE short_links SET link_type = CASE
  WHEN target_url ILIKE '%/product/%' OR target_url ILIKE '%/shop/%' THEN 'product'
  WHEN target_url ILIKE '%/checkout%' OR target_url ILIKE '%/cart%'  THEN 'checkout'
  WHEN target_url ILIKE '%/help/%'    OR target_url ILIKE '%/docs/%' THEN 'help'
  WHEN target_url ILIKE '%/book%'     OR target_url ILIKE '%/appointment%' THEN 'booking'
  WHEN target_url ILIKE '%stripe.com%' OR target_url ILIKE '%/pay%'  THEN 'payment'
  WHEN target_url ILIKE '%/form%'     OR target_url ILIKE '%/survey%' THEN 'form'
  WHEN target_url ~* '\.(png|jpe?g|gif|webp|heic|mp4|mov)(\?|$)'      THEN 'image'
  ELSE 'external'
END
WHERE link_type IS NULL;

-- Backfill contact_id on existing clicks from their link.
UPDATE link_clicks c
SET contact_id = l.contact_id
FROM short_links l
WHERE c.link_id = l.id AND c.contact_id IS NULL AND l.contact_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
