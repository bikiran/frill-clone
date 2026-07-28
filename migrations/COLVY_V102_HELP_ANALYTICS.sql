-- ============================================================
-- COLVY V102 — HELP CENTER ANALYTICS & FEATURES
-- Run in Supabase SQL editor. Safe to run multiple times.
-- ============================================================

-- Article view tracking (one row per view)
CREATE TABLE IF NOT EXISTS help_article_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES help_articles(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  source TEXT DEFAULT 'help_center', -- help_center | widget | search
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hav_company ON help_article_views(company_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_hav_article ON help_article_views(article_id);
ALTER TABLE help_article_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can log article views" ON help_article_views;
CREATE POLICY "Anyone can log article views" ON help_article_views FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can read article views" ON help_article_views;
CREATE POLICY "Anyone can read article views" ON help_article_views FOR SELECT USING (true);

-- Search tracking (query, results, click-through)
CREATE TABLE IF NOT EXISTS help_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  clicked_article_id UUID REFERENCES help_articles(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'help_center',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hs_company ON help_searches(company_id, created_at);
ALTER TABLE help_searches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can log searches" ON help_searches;
CREATE POLICY "Anyone can log searches" ON help_searches FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update searches" ON help_searches;
CREATE POLICY "Anyone can update searches" ON help_searches FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Anyone can read searches" ON help_searches;
CREATE POLICY "Anyone can read searches" ON help_searches FOR SELECT USING (true);

-- Article feedback (thumbs up/down)
CREATE TABLE IF NOT EXISTS help_article_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES help_articles(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  helpful BOOLEAN NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_haf_company ON help_article_feedback(company_id, created_at);
ALTER TABLE help_article_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can leave feedback" ON help_article_feedback;
CREATE POLICY "Anyone can leave feedback" ON help_article_feedback FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can read feedback" ON help_article_feedback;
CREATE POLICY "Anyone can read feedback" ON help_article_feedback FOR SELECT USING (true);

-- Done.

-- ============================================================
-- NOTIFICATIONS FIX — the table only had a SELECT policy, so RLS
-- silently rejected every INSERT (creating notifications for others)
-- and every UPDATE (marking as read). This is why notifications
-- never appeared.
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON notifications;
CREATE POLICY "Authenticated users can create notifications" ON notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- WOOCOMMERCE CUSTOMERS: ensure items_purchased is JSONB (a product list).
-- Older sync code may have written numbers into it; normalize the column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'woocommerce_customers' AND column_name = 'items_purchased'
      AND data_type NOT IN ('jsonb', 'json')
  ) THEN
    ALTER TABLE woocommerce_customers ALTER COLUMN items_purchased DROP DEFAULT;
    ALTER TABLE woocommerce_customers ALTER COLUMN items_purchased TYPE JSONB USING
      CASE
        WHEN items_purchased IS NULL THEN '[]'::jsonb
        WHEN items_purchased::text ~ '^\[' THEN items_purchased::text::jsonb
        ELSE '[]'::jsonb
      END;
    ALTER TABLE woocommerce_customers ALTER COLUMN items_purchased SET DEFAULT '[]'::jsonb;
  END IF;
END $$;
-- Clean any numeric junk left behind
UPDATE woocommerce_customers SET items_purchased = '[]'::jsonb
WHERE jsonb_typeof(items_purchased) IS DISTINCT FROM 'array';
