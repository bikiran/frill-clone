-- ============================================================
-- COLVY V160 — KEYWORD AUTO-REPLIES
-- Lets a business answer common questions automatically: when a
-- customer's message matches configured keywords ("where are you
-- located", "opening hours"), Colvy replies with the saved answer.
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS keyword_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  name TEXT,                       -- e.g. "Opening hours"
  keywords TEXT[] DEFAULT '{}',    -- e.g. {opening hours, what time do you close, hours}
  reply TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  -- Only auto-answer once per conversation per rule, so we don't nag.
  once_per_conversation BOOLEAN DEFAULT true,
  match_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_keyword_replies_company ON keyword_replies(company_id, is_active);
ALTER TABLE keyword_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage keyword_replies" ON keyword_replies;
CREATE POLICY "Anyone can manage keyword_replies" ON keyword_replies FOR ALL USING (true);

-- Track which rules already fired in a conversation.
CREATE TABLE IF NOT EXISTS keyword_reply_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  conversation_id UUID,
  keyword_reply_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS keyword_hits_uniq
  ON keyword_reply_hits (conversation_id, keyword_reply_id);
ALTER TABLE keyword_reply_hits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage keyword_reply_hits" ON keyword_reply_hits;
CREATE POLICY "Anyone can manage keyword_reply_hits" ON keyword_reply_hits FOR ALL USING (true);

-- The banner shown at the top of the admin (announcements to your team).
CREATE TABLE IF NOT EXISTS admin_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,                 -- NULL = platform-wide (super admin)
  message TEXT NOT NULL,
  link_url TEXT,
  link_label TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_banners ON admin_banners(company_id, is_active);
ALTER TABLE admin_banners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage admin_banners" ON admin_banners;
CREATE POLICY "Anyone can manage admin_banners" ON admin_banners FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
