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
