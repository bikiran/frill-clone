-- ============================================================
-- COLVY V150 — EMAIL CHANNEL (inbound + threaded replies)
-- Lets customers email the business and have it land in the Colvy
-- inbox as a conversation, with agent replies going back out by email
-- in the same thread. Safe to re-run.
-- ============================================================

-- Per-company inbound email settings.
CREATE TABLE IF NOT EXISTS email_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  -- The address customers write to, e.g. support@roxyaquarium.com.au
  inbound_address TEXT NOT NULL,
  -- The address replies are sent FROM (must be a Resend-verified domain).
  from_address TEXT,
  from_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_channels_addr_uniq ON email_channels (lower(inbound_address));
CREATE INDEX IF NOT EXISTS idx_email_channels_company ON email_channels(company_id);
ALTER TABLE email_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage email_channels" ON email_channels;
CREATE POLICY "Anyone can manage email_channels" ON email_channels FOR ALL USING (true);

-- Email threading data on conversations + messages.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS email_subject TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS email_message_id TEXT;  -- root Message-ID for threading
ALTER TABLE messages ADD COLUMN IF NOT EXISTS email_message_id TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS email_in_reply_to TEXT;

CREATE INDEX IF NOT EXISTS idx_conv_email_msgid ON conversations(company_id, email_message_id);

NOTIFY pgrst, 'reload schema';
