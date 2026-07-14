-- ============================================================
-- COLVY V167 — PER-CONVERSATION AI CONTROL
-- An agent can silence the AI in one conversation without turning it
-- off for the whole business — useful the moment a chat gets delicate.
-- Safe to re-run.
-- ============================================================

-- NULL = follow the company setting. true/false = explicitly overridden here.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN;

-- Helpful for the duplicate finder.
CREATE INDEX IF NOT EXISTS idx_contacts_email_lower
  ON contacts (company_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_phone
  ON contacts (company_id, phone) WHERE phone IS NOT NULL;

NOTIFY pgrst, 'reload schema';
