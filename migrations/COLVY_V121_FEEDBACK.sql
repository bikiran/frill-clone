-- ============================================================
-- COLVY V121 — FEEDBACK BUTTON + HELP FEEDBACK MEMORY
-- Run as a single step (two new tables + guards).
-- ============================================================

-- Persistent "Send feedback / report a bug" submissions (Coax-style button)
CREATE TABLE IF NOT EXISTS feedback_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  session_id TEXT,
  user_id UUID,
  user_email TEXT,
  page_url TEXT,
  user_agent TEXT,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open',   -- open | reviewing | resolved
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE feedback_reports ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE feedback_reports ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE feedback_reports ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE feedback_reports ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE feedback_reports ADD COLUMN IF NOT EXISTS page_url TEXT;
ALTER TABLE feedback_reports ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE feedback_reports ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE feedback_reports ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
CREATE INDEX IF NOT EXISTS idx_feedback_reports ON feedback_reports(company_id, created_at DESC);
ALTER TABLE feedback_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage feedback_reports" ON feedback_reports;
CREATE POLICY "Anyone can manage feedback_reports" ON feedback_reports FOR ALL USING (true);

-- Remember help-article feedback per user / per anonymous browser fingerprint.
-- This table may already exist from an earlier migration (V102) with a
-- different schema, so add the new columns BEFORE indexing them.
CREATE TABLE IF NOT EXISTS help_article_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID,
  company_id UUID,
  helpful BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE help_article_feedback ADD COLUMN IF NOT EXISTS article_id UUID;
ALTER TABLE help_article_feedback ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE help_article_feedback ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE help_article_feedback ADD COLUMN IF NOT EXISTS visitor_key TEXT;
ALTER TABLE help_article_feedback ADD COLUMN IF NOT EXISTS helpful BOOLEAN;
ALTER TABLE help_article_feedback ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS help_feedback_user_uniq ON help_article_feedback(article_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS help_feedback_visitor_uniq ON help_article_feedback(article_id, visitor_key) WHERE visitor_key IS NOT NULL;
ALTER TABLE help_article_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage help_article_feedback" ON help_article_feedback;
CREATE POLICY "Anyone can manage help_article_feedback" ON help_article_feedback FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';

-- Allow businesses to use their own Stripe API keys (alternative to Connect)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_mode TEXT DEFAULT 'connect';  -- connect | keys
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_secret_key TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_publishable_key TEXT;

NOTIFY pgrst, 'reload schema';
