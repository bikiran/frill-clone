-- ============================================================
-- COLVY V177 — INBOUND CALL CONTROL (ring-all-agents → voicemail)
--
-- The webhook previously only LOGGED inbound calls; it never issued
-- Call Control commands, so Telnyx hung up. This adds the config and
-- presence data the new flow needs.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- Per-business inbound call settings (voicemail greeting, ring time).
ALTER TABLE telnyx_integrations ADD COLUMN IF NOT EXISTS voice_api_application_id TEXT; -- the Voice API (Call Control) app the number is on
ALTER TABLE telnyx_integrations ADD COLUMN IF NOT EXISTS ring_seconds INT DEFAULT 25;
ALTER TABLE telnyx_integrations ADD COLUMN IF NOT EXISTS voicemail_enabled BOOLEAN DEFAULT true;
ALTER TABLE telnyx_integrations ADD COLUMN IF NOT EXISTS voicemail_greeting TEXT
  DEFAULT 'Thanks for calling. We are sorry we can not take your call right now. Please leave a message after the tone and we will get back to you.';

-- Each agent's WebRTC SIP username, so Call Control can dial their browser.
ALTER TABLE telnyx_integrations ADD COLUMN IF NOT EXISTS sip_username TEXT;   -- the credential SIP username, dialed by Call Control
ALTER TABLE telnyx_integrations ADD COLUMN IF NOT EXISTS credential_id TEXT;   -- the telephony credential id, used to mint browser tokens

-- Agent presence: who is online to receive a call, per company. A heartbeat
-- from the open Colvy tab keeps last_seen fresh; "online" = seen in last 2 min.
CREATE TABLE IF NOT EXISTS agent_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID,
  sip_username TEXT,                 -- this agent's Telnyx WebRTC credential username
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  available BOOLEAN DEFAULT true,    -- future: an explicit away toggle
  UNIQUE (company_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_agent_presence_company ON agent_presence(company_id, last_seen_at);

ALTER TABLE agent_presence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone manages agent_presence" ON agent_presence;
CREATE POLICY "Anyone manages agent_presence" ON agent_presence FOR ALL USING (true);

-- Voicemail + call outcome on the calls table.
ALTER TABLE calls ADD COLUMN IF NOT EXISTS is_voicemail BOOLEAN DEFAULT false;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS answered_by_user_id UUID;

NOTIFY pgrst, 'reload schema';
