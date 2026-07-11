-- ============================================================
-- COLVY V135 — MEDIA GALLERY
-- A categorized media library staff can pull from to send media
-- into chats. Designed to sync with Prexty (POS) via external ids.
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS media_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID,                        -- nested categories (optional)
  external_source TEXT,                  -- 'prexty' when synced
  external_id TEXT,                      -- id in the external system
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_folders_company ON media_folders(company_id);
ALTER TABLE media_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage media_folders" ON media_folders;
CREATE POLICY "Anyone can manage media_folders" ON media_folders FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS media_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  folder_id UUID,
  title TEXT,
  description TEXT,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  kind TEXT DEFAULT 'image',             -- image | video
  tags TEXT[],
  sku TEXT,                              -- link to a product if relevant
  external_source TEXT,                  -- 'prexty' when synced
  external_id TEXT,                      -- id in the external system
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_items_company ON media_items(company_id);
CREATE INDEX IF NOT EXISTS idx_media_items_folder ON media_items(folder_id);
CREATE UNIQUE INDEX IF NOT EXISTS media_items_ext_uniq ON media_items(company_id, external_source, external_id) WHERE external_id IS NOT NULL;
ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage media_items" ON media_items;
CREATE POLICY "Anyone can manage media_items" ON media_items FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
