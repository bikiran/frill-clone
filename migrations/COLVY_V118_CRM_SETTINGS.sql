-- ============================================================
-- COLVY V118 — INBOX/CRM SETTINGS (Coax-style)
-- User settings, custom fields, quick responses, categories,
-- AI settings, business branding, policies, campaigns.
-- Safe to run multiple times.
-- ============================================================

-- Per-user settings (profile, working hours, notifications, dialer)
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  contact_number TEXT,
  timezone TEXT DEFAULT 'Australia/Melbourne',
  working_hours_start TEXT DEFAULT '09:00',
  working_hours_end TEXT DEFAULT '17:00',
  default_location_id UUID,
  send_message_using TEXT DEFAULT 'chat',
  dialer_enabled BOOLEAN DEFAULT true,
  show_message_detail BOOLEAN DEFAULT true,
  browser_notifications BOOLEAN DEFAULT false,
  message_notifications BOOLEAN DEFAULT true,
  enquiry_notifications BOOLEAN DEFAULT true,
  email_notifications BOOLEAN DEFAULT true,
  mobile_notifications BOOLEAN DEFAULT false,
  notification_numbers JSONB DEFAULT '[]',
  notification_emails JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_settings_uniq ON user_settings(user_id, company_id);
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage user_settings" ON user_settings;
CREATE POLICY "Anyone can manage user_settings" ON user_settings FOR ALL USING (true);

-- Custom fields (contact card fields)
CREATE TABLE IF NOT EXISTS custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  field_type TEXT DEFAULT 'text',  -- text | number | date | checkbox | dropdown
  options JSONB DEFAULT '[]',      -- for dropdown
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_fields ON custom_fields(company_id);
ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage custom_fields" ON custom_fields;
CREATE POLICY "Anyone can manage custom_fields" ON custom_fields FOR ALL USING (true);

-- Quick responses (saved templates)
CREATE TABLE IF NOT EXISTS quick_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  shortcut TEXT,
  title TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quick_responses ON quick_responses(company_id);
ALTER TABLE quick_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage quick_responses" ON quick_responses;
CREATE POLICY "Anyone can manage quick_responses" ON quick_responses FOR ALL USING (true);

-- Conversation categories
CREATE TABLE IF NOT EXISTS conversation_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#ff7a6b',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conv_categories ON conversation_categories(company_id);
ALTER TABLE conversation_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage conversation_categories" ON conversation_categories;
CREATE POLICY "Anyone can manage conversation_categories" ON conversation_categories FOR ALL USING (true);

-- Per-company AI settings
CREATE TABLE IF NOT EXISTS ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  auto_reply BOOLEAN DEFAULT false,
  auto_reply_mode TEXT DEFAULT 'off',   -- off | draft | send
  draft_messages BOOLEAN DEFAULT false,
  contact_enrichment BOOLEAN DEFAULT false,
  qa_content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_settings_uniq ON ai_settings(company_id);
ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage ai_settings" ON ai_settings;
CREATE POLICY "Anyone can manage ai_settings" ON ai_settings FOR ALL USING (true);

-- Company branding / business details extensions
ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_mobile TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_email TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_address TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS abn_acn TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS secondary_color TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS font_family TEXT DEFAULT 'Public Sans';

-- Policies (waivers, consent forms)
CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  requires_signature BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage policies" ON policies;
CREATE POLICY "Anyone can manage policies" ON policies FOR ALL USING (true);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'sms',       -- sms | email
  message TEXT,
  status TEXT DEFAULT 'draft',   -- draft | scheduled | sent
  recipients_count INT DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaigns ON campaigns(company_id, created_at DESC);
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage campaigns" ON campaigns;
CREATE POLICY "Anyone can manage campaigns" ON campaigns FOR ALL USING (true);

-- Conversation spam/archive flags
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_spam BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

NOTIFY pgrst, 'reload schema';
