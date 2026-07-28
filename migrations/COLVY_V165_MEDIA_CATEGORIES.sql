-- ============================================================
-- COLVY V165 — MEDIA CATEGORIES (many per photo)
-- A photo often belongs in several places — "Tanks", "Oakleigh",
-- "Before & After". Folders are one-to-one; categories are many-to-many,
-- so a photo can sit in as many as you like without being duplicated.
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS media_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  colour TEXT,                       -- optional chip colour
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS media_categories_uniq
  ON media_categories (company_id, lower(name));
ALTER TABLE media_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage media_categories" ON media_categories;
CREATE POLICY "Anyone can manage media_categories" ON media_categories FOR ALL USING (true);

-- The join: one photo ↔ many categories.
CREATE TABLE IF NOT EXISTS media_item_categories (
  media_item_id UUID NOT NULL,
  category_id UUID NOT NULL,
  company_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (media_item_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_mic_category ON media_item_categories (category_id);
CREATE INDEX IF NOT EXISTS idx_mic_item ON media_item_categories (media_item_id);
ALTER TABLE media_item_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage media_item_categories" ON media_item_categories;
CREATE POLICY "Anyone can manage media_item_categories" ON media_item_categories FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
