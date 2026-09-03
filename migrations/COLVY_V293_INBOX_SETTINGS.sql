-- ============================================================
-- COLVY V293 — company-level inbox settings
-- A JSONB bag for shared inbox preferences (first use: the 12/24-hour time
-- format). Company-wide, so every agent sees the same format. Safe to re-run.
-- ============================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS inbox_settings JSONB DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
