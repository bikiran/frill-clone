-- ============================================================
-- COLVY V118 — INBOX/CRM SETTINGS (Coax-style)
-- Hardened: adds company_id + key columns to any PRE-EXISTING
-- table before indexing, so it works even if a table with the
-- same name already exists with a different schema.
-- Safe to run multiple times.
-- ============================================================

-- ── user_settings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS contact_number TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Australia/Melbourne';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS working_hours_start TEXT DEFAULT '09:00';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS working_hours_end TEXT DEFAULT '17:00';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS default_location_id UUID;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS send_message_using TEXT DEFAULT 'chat';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS dialer_enabled BOOLEAN DEFAULT true;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS show_message_detail BOOLEAN DEFAULT true;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS browser_notifications BOOLEAN DEFAULT false;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS message_notifications BOOLEAN DEFAULT true;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS enquiry_notifications BOOLEAN DEFAULT true;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT true;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS mobile_notifications BOOLEAN DEFAULT false;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notification_numbers JSONB DEFAULT '[]';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notification_emails JSONB DEFAULT '[]';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS user_settings_uniq ON user_settings(user_id, company_id);
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage user_settings" ON user_settings;
CREATE POLICY "Anyone can manage user_settings" ON user_settings FOR ALL USING (true);

-- ── custom_fields ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE custom_fields ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE custom_fields ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE custom_fields ADD COLUMN IF NOT EXISTS field_type TEXT DEFAULT 'text';
ALTER TABLE custom_fields ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '[]';
ALTER TABLE custom_fields ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_custom_fields ON custom_fields(company_id);
ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage custom_fields" ON custom_fields;
CREATE POLICY "Anyone can manage custom_fields" ON custom_fields FOR ALL USING (true);

-- ── quick_responses ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quick_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  body TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE quick_responses ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE quick_responses ADD COLUMN IF NOT EXISTS shortcut TEXT;
ALTER TABLE quick_responses ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE quick_responses ADD COLUMN IF NOT EXISTS body TEXT;
CREATE INDEX IF NOT EXISTS idx_quick_responses ON quick_responses(company_id);
ALTER TABLE quick_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage quick_responses" ON quick_responses;
CREATE POLICY "Anyone can manage quick_responses" ON quick_responses FOR ALL USING (true);

-- ── conversation_categories ─────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE conversation_categories ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE conversation_categories ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE conversation_categories ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#ff7a6b';
CREATE INDEX IF NOT EXISTS idx_conv_categories ON conversation_categories(company_id);
ALTER TABLE conversation_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage conversation_categories" ON conversation_categories;
CREATE POLICY "Anyone can manage conversation_categories" ON conversation_categories FOR ALL USING (true);

-- ── ai_settings ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS auto_reply BOOLEAN DEFAULT false;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS auto_reply_mode TEXT DEFAULT 'off';
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS draft_messages BOOLEAN DEFAULT false;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS contact_enrichment BOOLEAN DEFAULT false;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS qa_content TEXT;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS ai_settings_uniq ON ai_settings(company_id);
ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage ai_settings" ON ai_settings;
CREATE POLICY "Anyone can manage ai_settings" ON ai_settings FOR ALL USING (true);

-- ── companies branding / business details ───────────────────
ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_mobile TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_email TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_address TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS abn_acn TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS secondary_color TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS font_family TEXT DEFAULT 'Public Sans';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS widget_config JSONB;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS payment_settings JSONB;

-- ── policies ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE policies ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS requires_signature BOOLEAN DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_policies ON policies(company_id);
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage policies" ON policies;
CREATE POLICY "Anyone can manage policies" ON policies FOR ALL USING (true);

-- ── campaigns ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'sms';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS recipients_count INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_campaigns ON campaigns(company_id, created_at DESC);
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage campaigns" ON campaigns;
CREATE POLICY "Anyone can manage campaigns" ON campaigns FOR ALL USING (true);

-- ── conversations spam/archive flags ────────────────────────
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_spam BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- Add FKs to companies where the table was freshly created (ignored if they
-- already exist or if data would violate — safe to skip on error).
DO $$ BEGIN
  BEGIN ALTER TABLE user_settings ADD CONSTRAINT user_settings_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE custom_fields ADD CONSTRAINT custom_fields_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE quick_responses ADD CONSTRAINT quick_responses_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE conversation_categories ADD CONSTRAINT conv_categories_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE ai_settings ADD CONSTRAINT ai_settings_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE policies ADD CONSTRAINT policies_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE campaigns ADD CONSTRAINT campaigns_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END;
END $$;

NOTIFY pgrst, 'reload schema';
