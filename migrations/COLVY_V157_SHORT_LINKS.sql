-- ============================================================
-- COLVY V157 — EXTEND SHORT LINKS
-- short_links already exists (V115, used for SMS attachments). Extend it
-- so we can also wrap Stripe checkout URLs and media behind a short
-- colvy.com/l/<code> link — keeps SMS short, avoids spam-looking URLs,
-- and makes media viewable on mobile. Safe to re-run.
-- ============================================================

ALTER TABLE short_links ADD COLUMN IF NOT EXISTS kind TEXT;              -- payment | media | file | other
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS conversation_id UUID;
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS last_clicked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_short_links_company ON short_links (company_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
