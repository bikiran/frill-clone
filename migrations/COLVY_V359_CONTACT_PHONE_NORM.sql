-- ============================================================
-- COLVY V359 — KEEP contacts.phone_norm FILLED IN
--
-- Caller ID (the incoming-call popup, the phone agent, SMS matching) looks a
-- number up by its last 9 digits. contacts.phone_norm holds exactly that and is
-- indexed, but it was only filled once (V197): every contact added since then
-- had it empty, so lookups fell back to scanning the whole contacts table —
-- the slow "Looking up…" on incoming calls.
--
-- This fills it for every contact and keeps it right from now on (a trigger
-- sets it whenever a contact's phone is added or changed).
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_norm TEXT;

CREATE OR REPLACE FUNCTION contacts_set_phone_norm() RETURNS trigger AS $$
BEGIN
  NEW.phone_norm := NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(NEW.phone, ''), '\D', '', 'g'), 9), '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contacts_phone_norm ON contacts;
CREATE TRIGGER trg_contacts_phone_norm
  BEFORE INSERT OR UPDATE OF phone ON contacts
  FOR EACH ROW EXECUTE FUNCTION contacts_set_phone_norm();

UPDATE contacts
SET phone_norm = NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\D', '', 'g'), 9), '')
WHERE phone_norm IS DISTINCT FROM NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\D', '', 'g'), 9), '');

CREATE INDEX IF NOT EXISTS idx_contacts_phone_norm
  ON contacts (company_id, phone_norm);

NOTIFY pgrst, 'reload schema';
