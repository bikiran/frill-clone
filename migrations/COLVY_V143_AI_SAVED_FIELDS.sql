-- ============================================================
-- COLVY V143 — AI-SAVED FIELD MARKERS ON CONTACTS
-- Records which contact fields were auto-filled by AI so the AI
-- badge shows on any device (not just the browser that saved it).
-- Safe to re-run.
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ai_saved_fields TEXT[] DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
