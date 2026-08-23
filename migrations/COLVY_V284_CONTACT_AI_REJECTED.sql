-- ============================================================
-- COLVY V284 — REJECTED AI CONTACT VALUES
-- When a human clears or corrects a field that Colvy AI auto-filled,
-- we remember the rejected value here so the SMS contact-capture never
-- re-fills the same wrong value again (it can still capture a DIFFERENT,
-- correct value later). Shape: { "name": ["if we see"], "suburb": [...] }.
-- Safe to re-run.
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ai_rejected JSONB DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
