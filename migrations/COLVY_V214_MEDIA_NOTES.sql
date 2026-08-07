-- ============================================================
-- COLVY V214 — MEDIA ITEM NOTES
-- A lightweight notes thread on each gallery media item, so staff
-- can leave context ("use this for the spring promo", "@Jane approved")
-- and @mention teammates. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS media_item_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL,
  company_id UUID NOT NULL,
  body TEXT NOT NULL,
  author_id UUID,                        -- auth user who wrote it
  author_name TEXT,                      -- denormalised for instant display
  mentions JSONB DEFAULT '[]'::jsonb,    -- [{ id, name }] of @mentioned members
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_item_notes_item ON media_item_notes(item_id);
CREATE INDEX IF NOT EXISTS idx_media_item_notes_company ON media_item_notes(company_id);
ALTER TABLE media_item_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage media_item_notes" ON media_item_notes;
CREATE POLICY "Anyone can manage media_item_notes" ON media_item_notes FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
