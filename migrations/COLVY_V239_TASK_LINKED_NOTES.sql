-- ============================================================
-- COLVY V239 — LINK NOTES TO TASKS
-- A task can reference one or more notes. Stored as a jsonb array of
-- { id, title } on the task row (both task sources). Additive, safe to re-run.
-- ============================================================

ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS linked_notes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE calendar_events    ADD COLUMN IF NOT EXISTS linked_notes jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
