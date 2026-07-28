-- ============================================================
-- COLVY V96 FIXES MIGRATION
-- Run this in the Supabase SQL editor (project: mtfhctgdayeqrguodksv)
-- Safe to run multiple times (IF NOT EXISTS everywhere).
-- ============================================================

-- 1. POLLS & SURVEYS: add company scoping
--    Without company_id, polls and surveys created on one board leaked
--    into every other company's idea panel and admin lists.
ALTER TABLE polls   ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Columns the app writes but old schemas may lack
ALTER TABLE polls   ADD COLUMN IF NOT EXISTS poll_type TEXT DEFAULT 'single_choice';
ALTER TABLE polls   ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS questions JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_polls_company   ON polls(company_id);
CREATE INDEX IF NOT EXISTS idx_surveys_company ON surveys(company_id);

-- 2. OPTIONAL BACKFILL for existing polls/surveys with no company.
--    If you only have ONE real company so far, uncomment and set its id:
-- UPDATE polls   SET company_id = 'YOUR-COMPANY-UUID' WHERE company_id IS NULL;
-- UPDATE surveys SET company_id = 'YOUR-COMPANY-UUID' WHERE company_id IS NULL;
--    (Find your company id with:  SELECT id, name, slug FROM companies;)

-- 3. VOTE COUNTER: one-time repair so ideas.votes matches reality.
--    Logged-in votes previously wrote to the votes table without updating
--    the ideas.votes counter. This sets each idea's counter to at least
--    the number of rows in the votes table (guest votes already live in
--    the counter, so we never lower it).
UPDATE ideas i
SET votes = GREATEST(COALESCE(i.votes, 0), sub.cnt)
FROM (
  SELECT idea_id, COUNT(*)::int AS cnt
  FROM votes
  GROUP BY idea_id
) sub
WHERE sub.idea_id = i.id
  AND COALESCE(i.votes, 0) < sub.cnt;

-- 4. HELP ARTICLES / ANNOUNCEMENTS: guarantee a status value so the
--    "published only" public filter can never be bypassed by NULL status.
UPDATE help_articles SET status = 'draft'     WHERE status IS NULL;
UPDATE announcements SET status = 'published' WHERE status IS NULL; -- legacy rows were public

-- 5. SITE SETTINGS: remove duplicate rows per (key, company_id), keeping the
--    newest. Duplicates from older save paths made navigation settings load
--    inconsistently (appearing to "revert").
DELETE FROM site_settings a
USING site_settings b
WHERE a.key = b.key
  AND a.company_id IS NOT DISTINCT FROM b.company_id
  AND a.updated_at < b.updated_at;

-- Done.
-- ============================================================
-- COLVY V98 FIXES MIGRATION
-- Run this in the Supabase SQL editor (project: mtfhctgdayeqrguodksv)
-- Safe to run multiple times.
-- ============================================================

-- IDEAS.PRIORITY: the live column is INTEGER in some databases, but the app
-- saves preset keys like 'low' / 'medium' / 'high' / 'quick_wins'.
-- That mismatch causes: invalid input syntax for type integer: "low".
-- Convert to TEXT, mapping any old numeric values onto the preset keys.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ideas' AND column_name = 'priority'
      AND data_type IN ('integer', 'bigint', 'smallint', 'numeric')
  ) THEN
    ALTER TABLE ideas ALTER COLUMN priority DROP DEFAULT;
    ALTER TABLE ideas ALTER COLUMN priority TYPE TEXT USING (
      CASE priority::text
        WHEN '1' THEN 'low'
        WHEN '2' THEN 'medium'
        WHEN '3' THEN 'high'
        WHEN '4' THEN 'quick_wins'
        ELSE NULL
      END
    );
  END IF;
END $$;

-- Ensure the column exists as TEXT for fresh databases too
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS priority TEXT;

-- Done.

-- VOTES: store the voter's display name + avatar at vote time so the idea
-- detail view can show real profile icons instead of generic tick marks.
ALTER TABLE votes ADD COLUMN IF NOT EXISTS user_name TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS user_avatar TEXT;

-- FORM RESPONSES: add metadata columns for geo/device detection
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS screen_width INTEGER;
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS screen_height INTEGER;
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS response_time_seconds INTEGER;
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS referrer TEXT;

-- WOOCOMMERCE ORDERS: table for storing individual order history
CREATE TABLE IF NOT EXISTS woocommerce_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  woo_order_id INTEGER,
  woo_customer_id INTEGER,
  customer_email TEXT,
  status TEXT,
  total NUMERIC(10,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  order_date TIMESTAMPTZ,
  line_items JSONB DEFAULT '[]',
  billing JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, woo_order_id)
);
CREATE INDEX IF NOT EXISTS idx_woo_orders_customer ON woocommerce_orders(company_id, woo_customer_id);

-- WIDGET ANALYTICS: ensure created_at exists (the API previously only wrote a 'timestamp' column
-- which doesn't exist on the DB table — so we just add created_at with a default)
ALTER TABLE widget_analytics ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- COMMENTS: store display name at post time
ALTER TABLE comments ADD COLUMN IF NOT EXISTS user_name TEXT;
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
-- ============================================================
-- COLVY V105 — FULL INBOX / CHAT BACKEND
-- Run in Supabase SQL editor. Safe to run multiple times.
-- ============================================================

-- CONVERSATIONS (one per visitor/channel session)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  contact_id UUID,                        -- links to contacts table
  channel TEXT DEFAULT 'widget',          -- widget | email | sms | facebook | instagram
  status TEXT DEFAULT 'open',             -- open | assigned | resolved | closed
  assigned_to UUID REFERENCES auth.users(id),
  assigned_name TEXT,
  subject TEXT,
  visitor_id TEXT,                        -- anonymous visitor token
  page_url TEXT,                          -- page the chat was started on
  page_title TEXT,
  page_history JSONB DEFAULT '[]',        -- [{url, title, ts}] browsing trail
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message TEXT,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  unread_count INTEGER DEFAULT 0,
  is_unread BOOLEAN DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_conv_company ON conversations(company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_status ON conversations(company_id, status);
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can create conversations" ON conversations;
CREATE POLICY "Anyone can create conversations" ON conversations FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update conversations" ON conversations;
CREATE POLICY "Anyone can update conversations" ON conversations FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Anyone can read conversations" ON conversations;
CREATE POLICY "Anyone can read conversations" ON conversations FOR SELECT USING (true);

-- MESSAGES (one per chat message)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL,              -- visitor | agent | ai | system
  sender_id UUID,                        -- auth user id for agents
  sender_name TEXT,
  sender_email TEXT,
  content TEXT,
  attachments JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',            -- {ai_extracted: {phone, email, address}}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_read BOOLEAN DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can send messages" ON messages;
CREATE POLICY "Anyone can send messages" ON messages FOR ALL USING (true);

-- CONTACTS (unified CRM contact)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  source TEXT DEFAULT 'widget',          -- widget | import | woocommerce | manual
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  subscribed_to_marketing BOOLEAN DEFAULT false,
  woo_customer_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(company_id, email);
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can access contacts" ON contacts;
CREATE POLICY "Anyone can access contacts" ON contacts FOR ALL USING (true);

-- AI FLOWS (automation sequences)
CREATE TABLE IF NOT EXISTS ai_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT DEFAULT 'keyword',   -- keyword | new_conversation | time_delay | page_url
  trigger_value TEXT,
  is_active BOOLEAN DEFAULT true,
  steps JSONB DEFAULT '[]',              -- [{type: 'message'|'ai_reply'|'assign'|'tag', ...}]
  ai_mode TEXT DEFAULT 'off',            -- off | suggest | auto
  channels TEXT[] DEFAULT '{widget}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ai_flows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage ai_flows" ON ai_flows;
CREATE POLICY "Anyone can manage ai_flows" ON ai_flows FOR ALL USING (true);

-- REVIEWS
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id),
  platform TEXT DEFAULT 'google',        -- google | facebook | yelp
  reviewer_name TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  review_date TIMESTAMPTZ,
  reply TEXT,
  replied_at TIMESTAMPTZ,
  external_id TEXT,                      -- platform-specific ID
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reviews_company ON reviews(company_id, review_date DESC);
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage reviews" ON reviews;
CREATE POLICY "Anyone can manage reviews" ON reviews FOR ALL USING (true);

-- SCHEDULED MESSAGES
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id),
  contact_id UUID REFERENCES contacts(id),
  message TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  channel TEXT DEFAULT 'widget',
  status TEXT DEFAULT 'pending',         -- pending | sent | cancelled
  type TEXT DEFAULT 'message',           -- message | review_request
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage scheduled_messages" ON scheduled_messages;
CREATE POLICY "Anyone can manage scheduled_messages" ON scheduled_messages FOR ALL USING (true);

-- Done.

-- ANNOUNCEMENTS: notification settings + subscriber notify tracking
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS notify_subscribers BOOLEAN DEFAULT true;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS segmentation TEXT DEFAULT 'all';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

-- ============================================================
-- IMPORTANT: After running this file, refresh PostgREST's schema cache
-- so new columns (like polls.company_id) are recognized immediately:
--   Supabase Dashboard → Settings → API → click "Reload schema cache"
-- Or run:  NOTIFY pgrst, 'reload schema';
-- ============================================================
NOTIFY pgrst, 'reload schema';
