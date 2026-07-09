-- ============================================================
-- COLVY V113 — RICH CHAT FEATURES
-- Reactions, read receipts, sentiment, snooze, notes, tasks, timeline
-- Safe to run multiple times.
-- ============================================================

-- Messages: reactions, reply-to (threading), read receipts, attachments already exist
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '[]';        -- [{emoji, by, at}]
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to UUID;                        -- id of message being replied to
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_by JSONB DEFAULT '[]';           -- [{name, initial, at}]

-- Conversations: sentiment, snooze, review request tracking
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sentiment TEXT;                  -- positive | neutral | negative
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_todos JSONB DEFAULT '[]';     -- [{text, done}]
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS review_requested BOOLEAN DEFAULT false;

-- Conversation timeline events (assign, status change, notes, etc.)
CREATE TABLE IF NOT EXISTS conversation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,             -- assigned | status_change | note | review_request | subscribed | task
  actor_name TEXT,
  detail TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conv_events ON conversation_events(conversation_id, created_at DESC);
ALTER TABLE conversation_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage conversation_events" ON conversation_events;
CREATE POLICY "Anyone can manage conversation_events" ON conversation_events FOR ALL USING (true);

-- Conversation notes
CREATE TABLE IF NOT EXISTS conversation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  author_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conv_notes ON conversation_notes(conversation_id, created_at DESC);
ALTER TABLE conversation_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage conversation_notes" ON conversation_notes;
CREATE POLICY "Anyone can manage conversation_notes" ON conversation_notes FOR ALL USING (true);

-- Conversation tasks
CREATE TABLE IF NOT EXISTS conversation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done BOOLEAN DEFAULT false,
  assigned_to TEXT,
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conv_tasks ON conversation_tasks(conversation_id, created_at DESC);
ALTER TABLE conversation_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage conversation_tasks" ON conversation_tasks;
CREATE POLICY "Anyone can manage conversation_tasks" ON conversation_tasks FOR ALL USING (true);

-- Storage bucket for chat attachments (create in dashboard if this fails)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- Multiple workspace locations (Australian address format)
CREATE TABLE IF NOT EXISTS company_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  label TEXT,                    -- e.g. "Head Office", "Warehouse"
  unit TEXT,                     -- unit/suite number
  street_address TEXT,           -- e.g. "123 Collins Street"
  suburb TEXT,                   -- e.g. "Melbourne"
  state TEXT,                    -- VIC, NSW, QLD, etc.
  postcode TEXT,                 -- 4-digit AU postcode
  country TEXT DEFAULT 'Australia',
  phone TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_company_locations ON company_locations(company_id);
ALTER TABLE company_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage company_locations" ON company_locations;
CREATE POLICY "Anyone can manage company_locations" ON company_locations FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
