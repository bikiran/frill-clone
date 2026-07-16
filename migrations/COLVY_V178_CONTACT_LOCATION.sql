-- ============================================================
-- COLVY V178 — CONTACT LOCATION (for the CRM location filter)
--
-- Contacts had no location of their own, so the Inbox & CRM location
-- filter couldn't scope the Contacts page. Add location_id and backfill
-- it from each contact's most recent conversation that has an outlet.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS location_id UUID;

-- Backfill: give each contact the outlet of their most recent located
-- conversation. COALESCE handles both the auto-assigned and the older
-- location_id column on conversations.
UPDATE contacts c
SET location_id = sub.loc
FROM (
  SELECT DISTINCT ON (contact_id)
    contact_id,
    COALESCE(assigned_location_id, location_id) AS loc
  FROM conversations
  WHERE contact_id IS NOT NULL
    AND COALESCE(assigned_location_id, location_id) IS NOT NULL
  ORDER BY contact_id, last_message_at DESC NULLS LAST
) sub
WHERE c.id = sub.contact_id
  AND c.location_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_location ON contacts(company_id, location_id);

NOTIFY pgrst, 'reload schema';
