-- ============================================================
-- COLVY V161 — MULTI-ACCOUNT EMAIL (Gmail OAuth + domain webhooks)
--
-- Two ways an email account can reach Colvy:
--   'webhook' → mail for an address you own is routed to Colvy by your
--               DNS/email provider. Works for domains you control.
--   'gmail'   → you sign in with Google; Colvy reads and sends via the
--               Gmail API. This is the ONLY way to use an @gmail.com
--               address, since you can't point Gmail at a webhook.
--
-- Accounts can be tied to an outlet (company_locations), so each shop has
-- its own inbox. Safe to re-run.
-- ============================================================

-- Rebuild email_channels as a multi-account table.
ALTER TABLE email_channels ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'webhook';  -- webhook | gmail
ALTER TABLE email_channels ADD COLUMN IF NOT EXISTS location_id UUID;                  -- which outlet owns this inbox
ALTER TABLE email_channels ADD COLUMN IF NOT EXISTS label TEXT;                        -- friendly name

-- Gmail OAuth credentials (only used when provider = 'gmail').
ALTER TABLE email_channels ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE email_channels ADD COLUMN IF NOT EXISTS refresh_token TEXT;
ALTER TABLE email_channels ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE email_channels ADD COLUMN IF NOT EXISTS history_id TEXT;                   -- Gmail sync cursor
ALTER TABLE email_channels ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE email_channels ADD COLUMN IF NOT EXISTS sync_error TEXT;

-- Bring everything in, even from senders who aren't contacts yet?
ALTER TABLE email_channels ADD COLUMN IF NOT EXISTS sync_all BOOLEAN DEFAULT true;

-- The old unique index allowed only ONE address per company. Drop it so a
-- business can connect several mailboxes (one per outlet).
DROP INDEX IF EXISTS email_channels_addr_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS email_channels_company_addr_uniq
  ON email_channels (company_id, lower(inbound_address));
CREATE INDEX IF NOT EXISTS idx_email_channels_location ON email_channels(company_id, location_id);
CREATE INDEX IF NOT EXISTS idx_email_channels_provider ON email_channels(provider, is_active);

-- ── Email rules: which senders always sync, and which never do ──────────────
CREATE TABLE IF NOT EXISTS email_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  email_channel_id UUID NOT NULL,
  rule_type TEXT NOT NULL,          -- 'allow' | 'block'
  pattern TEXT NOT NULL,            -- a domain (example.com) or a full address
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_rules_uniq
  ON email_rules (email_channel_id, lower(pattern), rule_type);
CREATE INDEX IF NOT EXISTS idx_email_rules_channel ON email_rules(email_channel_id, is_enabled);
ALTER TABLE email_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage email_rules" ON email_rules;
CREATE POLICY "Anyone can manage email_rules" ON email_rules FOR ALL USING (true);

-- ── Email signatures ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  email_channel_id UUID,            -- NULL = available to all accounts
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_signatures ON email_signatures(company_id);
ALTER TABLE email_signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage email_signatures" ON email_signatures;
CREATE POLICY "Anyone can manage email_signatures" ON email_signatures FOR ALL USING (true);

-- Which mailbox a conversation belongs to, so replies go out from the right one.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS email_channel_id UUID;

-- Track Gmail message ids so we never import the same email twice.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS gmail_message_id TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_gmail ON messages(gmail_message_id);

NOTIFY pgrst, 'reload schema';
