-- ============================================================
-- COLVY V256 — CONTACT SUBURB
-- Dedicated suburb column on contacts, populated by the server-side Colvy AI
-- contact capture that runs on every inbound SMS (extracts the sender's name +
-- suburb from the message, seeds the phone from the sender number, and
-- creates/links the contact). Kept separate from `city` so a bare AU suburb
-- ("Ballarat") isn't conflated with a Google-verified city on an address.
--
-- Safe to re-run.
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS suburb TEXT;
