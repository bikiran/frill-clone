-- ============================================================
-- COLVY V189 — LINK CLICK ANALYTICS
--
-- Extends the EXISTING short_links system (V115/V157) rather than adding a
-- parallel one. Links in outbound SMS are already rewritten to
-- {company}.colvy.com/l/{code}; this adds per-click detail (when, where, what
-- device, referrer) so the Reports tab can answer "was it clicked, and from
-- where".
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- ── Extra attribution on the link itself ───────────────────────────────────
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS contact_id      UUID;
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS message_id      UUID;
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS conversation_id UUID;
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS channel         TEXT DEFAULT 'sms';
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS sent_by         TEXT;
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS last_clicked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_short_links_company_created
  ON short_links (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_short_links_conversation
  ON short_links (conversation_id);

-- ── Individual click events ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS link_clicks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id    UUID NOT NULL,
  company_id UUID,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip         TEXT,
  city       TEXT,
  region     TEXT,
  country    TEXT,
  device     TEXT,   -- mobile / tablet / desktop
  os         TEXT,
  browser    TEXT,
  referrer   TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_link_clicks_link    ON link_clicks (link_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_link_clicks_company ON link_clicks (company_id, clicked_at DESC);

ALTER TABLE link_clicks ENABLE ROW LEVEL SECURITY;

-- The redirect route writes with the service role; staff read in Reports.
DROP POLICY IF EXISTS link_clicks_insert ON link_clicks;
CREATE POLICY link_clicks_insert ON link_clicks FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS link_clicks_select ON link_clicks;
CREATE POLICY link_clicks_select ON link_clicks FOR SELECT USING (true);

NOTIFY pgrst, 'reload schema';
