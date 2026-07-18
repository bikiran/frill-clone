-- ============================================================
-- COLVY V191 — REPAIR CATEGORY SLUGS + CATEGORY ICONS
--
-- Two things:
--
-- 1. REPAIR. The seed in V187 stripped [^a-z0-9-] BEFORE lowercasing, which
--    deleted every uppercase letter: "Getting Started" became "etting-tarted"
--    and "API" became an empty string. This rebuilds every slug correctly from
--    the category name.
--
-- 2. ICONS. Adds an `icon` column so each category can have its own emoji,
--    editable from Settings → Help Categories, instead of relying on a
--    hardcoded name→emoji map that only matched a fixed set of names.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- ── 1. Icon column ─────────────────────────────────────────────────────────
ALTER TABLE help_categories ADD COLUMN IF NOT EXISTS icon TEXT;

-- ── 2. Repair the mangled slugs ────────────────────────────────────────────
-- Drop the unique index first so intermediate states can't collide, then
-- recreate it afterwards.
DROP INDEX IF EXISTS idx_help_categories_company_slug;

UPDATE help_categories
SET slug = REGEXP_REPLACE(REGEXP_REPLACE(LOWER(name), '\s+', '-', 'g'), '[^a-z0-9-]', '', 'g')
WHERE name IS NOT NULL AND name <> '';

-- A name that reduces to nothing (or duplicates) still needs a usable slug.
UPDATE help_categories
SET slug = 'category-' || LEFT(id::text, 8)
WHERE slug IS NULL OR slug = '';

-- De-duplicate any slugs that collided after the repair, keeping the oldest.
WITH ranked AS (
  SELECT id, slug, company_id,
         ROW_NUMBER() OVER (PARTITION BY company_id, slug ORDER BY created_at, id) AS rn
  FROM help_categories
)
UPDATE help_categories h
SET slug = h.slug || '-' || r.rn
FROM ranked r
WHERE h.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_help_categories_company_slug
  ON help_categories (company_id, slug);

-- ── 3. Point articles at the repaired slugs ────────────────────────────────
-- Articles created while the bug was live stored the broken slug (e.g.
-- "etting-tarted"). Re-link them to the corrected slug for the same category.
UPDATE help_articles a
SET category = c.slug
FROM help_categories c
WHERE a.company_id = c.company_id
  AND a.category IS NOT NULL
  AND a.category <> c.slug
  AND REGEXP_REPLACE(REGEXP_REPLACE(LOWER(c.name), '\s+', '-', 'g'), '[^a-z0-9-]', '', 'g') = c.slug
  AND (
    -- match the old broken form: name with uppercase letters removed
    a.category = REGEXP_REPLACE(REGEXP_REPLACE(c.name, '\s+', '-', 'g'), '[^a-z0-9-]', '', 'g')
    -- or the plain name itself (older articles stored the display name)
    OR a.category = c.name
  );

-- ── 4. Sensible default icons for the common categories ────────────────────
UPDATE help_categories SET icon = CASE LOWER(name)
  WHEN 'getting started'  THEN '🚀'
  WHEN 'features'         THEN '✨'
  WHEN 'billing'          THEN '💳'
  WHEN 'integrations'     THEN '🔗'
  WHEN 'troubleshooting'  THEN '🔧'
  WHEN 'api'              THEN '⚡'
  ELSE '📁'
END
WHERE icon IS NULL;

NOTIFY pgrst, 'reload schema';
