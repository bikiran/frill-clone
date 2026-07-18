-- ============================================================
-- COLVY V187 — HELP CATEGORIES TABLE
--
-- The help article editor and the Settings → Help Categories page both read and
-- write `help_categories`, but the table was never created — so categories
-- silently failed to load (the Category dropdown fell back to hardcoded
-- defaults) and new categories could not be added or edited.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS help_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One slug per company (a company can't have two "getting-started" categories).
CREATE UNIQUE INDEX IF NOT EXISTS idx_help_categories_company_slug
  ON help_categories (company_id, slug);

-- Ordered listing per company.
CREATE INDEX IF NOT EXISTS idx_help_categories_company_position
  ON help_categories (company_id, position);

ALTER TABLE help_categories ENABLE ROW LEVEL SECURITY;

-- Public read (help centre is customer-facing), authenticated write.
DROP POLICY IF EXISTS help_categories_select ON help_categories;
CREATE POLICY help_categories_select ON help_categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS help_categories_all ON help_categories;
CREATE POLICY help_categories_all ON help_categories
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Seed each company's categories from the categories already used by their
-- existing help articles, so nothing looks empty after this runs.
INSERT INTO help_categories (company_id, name, slug, position)
SELECT DISTINCT
  a.company_id,
  a.category,
  LOWER(REGEXP_REPLACE(REGEXP_REPLACE(a.category, '\s+', '-', 'g'), '[^a-z0-9-]', '', 'g')),
  0
FROM help_articles a
WHERE a.category IS NOT NULL
  AND a.category <> ''
  AND a.company_id IS NOT NULL
ON CONFLICT (company_id, slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';
