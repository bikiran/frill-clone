-- ============================================================
-- COLVY V174 — META CHANNELS (Instagram DM + Facebook Messenger)
--
-- One shared Meta app (option A), many connected Pages / IG accounts,
-- each mapped to a Colvy outlet so its DMs land in that location's
-- inbox.
--
-- IMPORTANT: none of this works with real customers until the Meta
-- app passes App Review. Before that it works only for accounts added
-- as testers in the Meta dev app. See META_SETUP.md.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS meta_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,                    -- 'facebook' | 'instagram'
  page_id TEXT NOT NULL,                      -- Facebook Page id
  page_name TEXT,
  ig_account_id TEXT,                         -- linked Instagram business account id (instagram only)
  ig_username TEXT,
  page_access_token TEXT,                     -- long-lived Page token
  token_expires_at TIMESTAMPTZ,
  location_id UUID,                           -- which outlet owns this connection
  is_active BOOLEAN DEFAULT true,
  connected_by UUID,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One row per (company, platform, page). Reconnecting updates in place.
CREATE UNIQUE INDEX IF NOT EXISTS meta_channels_uniq
  ON meta_channels (company_id, platform, page_id);
CREATE INDEX IF NOT EXISTS idx_meta_channels_company ON meta_channels(company_id);
-- Webhooks arrive keyed by page_id / ig_account_id, so index those for lookup.
CREATE INDEX IF NOT EXISTS idx_meta_channels_page ON meta_channels(page_id);
CREATE INDEX IF NOT EXISTS idx_meta_channels_ig ON meta_channels(ig_account_id);

ALTER TABLE meta_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage meta_channels" ON meta_channels;
CREATE POLICY "Anyone can manage meta_channels" ON meta_channels FOR ALL USING (true);

-- Meta's user-scoped ID (PSID / IGSID) for a contact, so replies address the
-- right person and repeat DMs thread into the same conversation.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS meta_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_contacts_meta_user ON contacts(meta_user_id);

-- Track which meta channel a conversation belongs to (for reply routing).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS meta_channel_id UUID;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS meta_user_id TEXT;

NOTIFY pgrst, 'reload schema';

-- Meta's message id on each message, for dedupe and echo suppression.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS meta_message_id TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_meta ON messages(meta_message_id);

NOTIFY pgrst, 'reload schema';

-- ── Cross-channel identity linking ──────────────────────────
-- One person may appear as several contacts (live chat, SMS, Messenger, IG).
-- We link them under a shared identity_group_id so their profile and timeline
-- show every channel they've used. Matching is on things that genuinely
-- identify a person: email or phone (last 8 digits).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS identity_group_id UUID;
CREATE INDEX IF NOT EXISTS idx_contacts_identity ON contacts(identity_group_id);
-- Which channels a contact has been seen on (for the profile's channel list).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS channels_seen JSONB DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
