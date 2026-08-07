-- ============================================================
-- COLVY V229 — TASK CHECKLISTS
-- A task can carry a checklist: an ordered list of { id, text, done } items,
-- shown with a progress count. Stored as a JSONB array. Added to both native
-- tasks and calendar-scheduled items so it's available wherever a task is
-- opened. Additive and safe to re-run.
-- ============================================================

ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '[]'::jsonb;
ALTER TABLE calendar_events    ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
