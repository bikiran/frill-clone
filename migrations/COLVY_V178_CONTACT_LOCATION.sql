-- ============================================================
-- COLVY V178 — CONTACT LOCATION (for the Inbox & CRM location filter)
--
-- Contacts had no location association, so the location filter could only
-- scope conversations, not the Contacts page. Add location_id and backfill it
-- from each contact's conversations (the outlet they've dealt with).
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS location_id UUID;

CREATE INDEX IF NOT EXISTS idx_contacts_location ON contacts (company_id, location_id);

-- Backfill: give each contact the outlet from their most recent conversation
-- that has one assigned. Only fills contacts that don't already have a location.
UPDATE contacts c
SET location_id = sub.loc
FROM (
  SELECT DISTINCT ON (contact_id)
         contact_id,
         COALESCE(assigned_location_id, location_id) AS loc
  FROM conversations
  WHERE contact_id IS NOT NULL
    AND COALESCE(assigned_location_id, location_id) IS NOT NULL
  ORDER BY contact_id, last_message_at DESC
) sub
WHERE c.id = sub.contact_id
  AND c.location_id IS NULL;

NOTIFY pgrst, 'reload schema';
