-- ============================================================
-- COLVY V245 — SOCIAL ENGAGEMENT MANAGER
-- Unifies Facebook/Instagram post comments into one dashboard: sync posts +
-- comments, AI-classify each (risk level, category, sentiment), reply / hide /
-- archive, and DM. This migration lays the data model + the per-category
-- config (AI-reply + DM guidelines). Additive, safe to re-run.
-- ============================================================

-- Per-company comment categories with their AI-reply + DM guidelines. The
-- default set is provisioned by the app on first load (see /api/social/categories).
CREATE TABLE IF NOT EXISTS social_comment_categories (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL,
  name              text NOT NULL,
  slug              text NOT NULL,
  sort_order        int  NOT NULL DEFAULT 0,
  reply_ai_enabled  boolean NOT NULL DEFAULT false,   -- let AI auto-reply to this category
  reply_guidelines  text,                              -- how AI should reply
  dm_enabled        boolean NOT NULL DEFAULT false,    -- let AI DM the commenter
  dm_guidelines     text,                              -- how AI should DM
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_social_categories_company ON social_comment_categories (company_id, sort_order);

-- Synced posts (Facebook feed / Instagram media).
CREATE TABLE IF NOT EXISTS social_posts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL,
  meta_channel_id   uuid,
  platform          text,                              -- 'facebook' | 'instagram'
  external_post_id  text NOT NULL,
  permalink         text,
  message           text,
  media_url         text,
  post_type         text,                              -- 'post' | 'reel' | 'photo' | ...
  posted_at         timestamptz,
  raw               jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, external_post_id)
);
CREATE INDEX IF NOT EXISTS idx_social_posts_company ON social_posts (company_id, posted_at DESC);

-- Synced comments, one row per comment, with the AI classification.
CREATE TABLE IF NOT EXISTS social_comments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL,
  post_id             uuid,                            -- social_posts.id
  meta_channel_id     uuid,
  platform            text,
  external_comment_id text NOT NULL,
  external_post_id    text,
  author_name         text,
  author_id           text,
  author_photo        text,
  message             text,
  attachment_url      text,
  risk_level          text,                            -- 'safe' | 'critical'
  category            text,                            -- matches a category slug/name
  sentiment           text,                            -- 'positive' | 'neutral' | 'negative'
  is_replied          boolean NOT NULL DEFAULT false,
  replied_by_ai       boolean NOT NULL DEFAULT false,
  reply_text          text,
  is_hidden           boolean NOT NULL DEFAULT false,
  is_archived         boolean NOT NULL DEFAULT false,
  commented_at        timestamptz,
  raw                 jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, external_comment_id)
);
CREATE INDEX IF NOT EXISTS idx_social_comments_company ON social_comments (company_id, commented_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_comments_category ON social_comments (company_id, category);

ALTER TABLE social_comment_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_comments          ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage social_comment_categories" ON social_comment_categories;
DROP POLICY IF EXISTS "Anyone can manage social_posts" ON social_posts;
DROP POLICY IF EXISTS "Anyone can manage social_comments" ON social_comments;
CREATE POLICY "Anyone can manage social_comment_categories" ON social_comment_categories FOR ALL USING (true);
CREATE POLICY "Anyone can manage social_posts" ON social_posts FOR ALL USING (true);
CREATE POLICY "Anyone can manage social_comments" ON social_comments FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
