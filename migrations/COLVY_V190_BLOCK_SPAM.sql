-- ============================================================
-- COLVY V190 — BLOCK CONTACT / REPORT SPAM
--
-- Lets staff block a nuisance contact and report them as spam from the contact
-- panel. A blocked contact's inbound messages are still stored (so there's an
-- audit trail) but their conversations are marked so they can be filtered out
-- of the working inbox.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_blocked   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS blocked_at   TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS blocked_by   TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS spam_reported_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_company_blocked
  ON contacts (company_id, is_blocked);

-- conversations.is_spam already exists (V118); make sure it's there for
-- databases where that migration was never applied.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_spam BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_conversations_company_spam
  ON conversations (company_id, is_spam);

NOTIFY pgrst, 'reload schema';
