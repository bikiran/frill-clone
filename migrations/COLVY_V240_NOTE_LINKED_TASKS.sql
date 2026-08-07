-- ============================================================
-- COLVY V240 — LINK TASKS TO NOTES
-- The reverse of V239: a note can reference one or more tasks. Stored as a jsonb
-- array of { id, title } on the note row. Additive, safe to re-run.
-- ============================================================

ALTER TABLE notes ADD COLUMN IF NOT EXISTS linked_tasks jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
