-- ============================================================
-- COLVY V234 — NOTES EXTRAS
-- Trash (soft delete), tags, a reminder time, and pin-to-top for notes.
-- Additive and safe to re-run.
-- ============================================================

ALTER TABLE notes ADD COLUMN IF NOT EXISTS trashed_at  TIMESTAMPTZ;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS tags        JSONB NOT NULL DEFAULT '[]'::jsonb;   -- ["fish","urgent"]
ALTER TABLE notes ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS pinned      BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
