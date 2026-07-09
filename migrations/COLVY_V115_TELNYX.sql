-- ============================================================
-- COLVY V115 — TELNYX VOICE + SMS INTEGRATION
-- Browser calling (WebRTC) and SMS continuation of live chat.
-- Safe to run multiple times.
-- ============================================================

-- Per-company Telnyx configuration
CREATE TABLE IF NOT EXISTS telnyx_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  api_key TEXT,                         -- Telnyx API v2 key (server-side only)
  messaging_profile_id TEXT,            -- for SMS
  connection_id TEXT,                   -- Voice API / Call Control connection (Credential connection for WebRTC)
  sip_username TEXT,                    -- WebRTC credential username
  sip_password TEXT,                    -- WebRTC credential password
  phone_number TEXT,                    -- the company's Telnyx number in E.164 (e.g. +61...)
  outbound_voice_profile_id TEXT,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS telnyx_company_uniq ON telnyx_integrations(company_id);
ALTER TABLE telnyx_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage telnyx_integrations" ON telnyx_integrations;
CREATE POLICY "Anyone can manage telnyx_integrations" ON telnyx_integrations FOR ALL USING (true);

-- Call log — every browser/mobile call, linked to a conversation + contact
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  direction TEXT DEFAULT 'outbound',    -- outbound | inbound
  from_number TEXT,
  to_number TEXT,
  status TEXT DEFAULT 'initiated',      -- initiated | ringing | answered | completed | busy | failed | no-answer
  telnyx_call_control_id TEXT,
  telnyx_call_session_id TEXT,
  duration_seconds INT DEFAULT 0,
  recording_url TEXT,
  transcription TEXT,
  ai_summary TEXT,
  agent_name TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calls_company ON calls(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_conversation ON calls(conversation_id);
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage calls" ON calls;
CREATE POLICY "Anyone can manage calls" ON calls FOR ALL USING (true);

-- Conversations: SMS continuation fields
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sms_number TEXT;            -- visitor's mobile in E.164
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN DEFAULT false; -- visitor opted in to SMS replies
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel_number TEXT;        -- the Telnyx number this thread uses

-- Messages: mark which ones went out/in over SMS
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_channel TEXT DEFAULT 'chat'; -- chat | sms
ALTER TABLE messages ADD COLUMN IF NOT EXISTS telnyx_message_id TEXT;

NOTIFY pgrst, 'reload schema';

-- Self-serve provisioning: track numbers Colvy buys on behalf of companies
ALTER TABLE telnyx_integrations ADD COLUMN IF NOT EXISTS provisioned_by_colvy BOOLEAN DEFAULT false;
ALTER TABLE telnyx_integrations ADD COLUMN IF NOT EXISTS number_order_id TEXT;
ALTER TABLE telnyx_integrations ADD COLUMN IF NOT EXISTS monthly_cost NUMERIC DEFAULT 2;
ALTER TABLE telnyx_integrations ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ;

-- Inbound call context: allow calls table to store caller info snapshot
ALTER TABLE calls ADD COLUMN IF NOT EXISTS caller_name TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS answered_by TEXT;

NOTIFY pgrst, 'reload schema';
