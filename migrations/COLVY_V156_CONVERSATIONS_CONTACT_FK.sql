-- ============================================================
-- COLVY V156 — CONVERSATIONS → CONTACTS FOREIGN KEY
-- conversations.contact_id had no FK to contacts, so PostgREST could
-- not resolve embedded selects like `contacts(name,email)` — which made
-- the whole query fail and the inbox render empty ("No conversations yet").
-- Adding the FK makes embeds work and enforces referential integrity.
-- Safe to re-run.
-- ============================================================

-- Clear any orphaned contact_ids first, or the FK creation will fail.
UPDATE conversations c
SET contact_id = NULL
WHERE contact_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contacts ct WHERE ct.id = c.contact_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_contact_id_fkey'
      AND conrelid = 'conversations'::regclass
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_contact_id_fkey
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);

NOTIFY pgrst, 'reload schema';
