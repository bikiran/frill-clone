-- ============================================================
-- COLVY V302 — BLOG POSTS (marketing blog CMS)
--
-- Backs the colvy.com /blog magazine and its super-admin editor. These are
-- Colvy's OWN marketing articles (not per-company data), so there is no
-- company_id — the blog is a single, platform-wide publication.
--
-- The public site reads published rows (server-side) and merges them with the
-- built-in seed articles in lib/blog.ts; the super-admin console writes here via
-- the service role (which bypasses RLS). A public SELECT policy still exposes
-- only PUBLISHED rows, so drafts never leak even if read with the anon key.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT,                       -- Markdown body
  cover_url TEXT,                     -- optional hero image
  category TEXT DEFAULT 'Playbooks',
  tags TEXT[] DEFAULT '{}',
  author_name TEXT DEFAULT 'The Colvy Team',
  author_avatar TEXT,
  accent TEXT DEFAULT '#ff6a4d',      -- gradient tile colour when there's no cover
  icon TEXT DEFAULT 'inbox',          -- FeatureIcon name for the gradient tile
  seo_title TEXT,
  seo_description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',   -- 'draft' | 'published'
  published_at TIMESTAMPTZ,
  reading_minutes INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts(published_at DESC);

-- RLS: anyone may read PUBLISHED posts; all writes go through the service role
-- (super-admin API), which bypasses RLS. Drafts are never exposed to anon.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "Public can read published blog posts" ON blog_posts';
  EXECUTE 'CREATE POLICY "Public can read published blog posts" ON blog_posts FOR SELECT USING (status = ''published'')';
END $$;

NOTIFY pgrst, 'reload schema';
