-- ============================================================
-- COLVY V228 — MANUAL TASK ORDERING (DRAG & DROP)
-- Tasks can now be dragged to reorder within a day and across days on the
-- Timeline. A numeric sort_order holds the manual position; lower = higher up.
-- Applies to both native tasks (conversation_tasks) and calendar-scheduled
-- items (calendar_events) so ordering is consistent wherever they appear.
-- Additive and safe to re-run.
-- ============================================================

ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS sort_order DOUBLE PRECISION;
ALTER TABLE calendar_events    ADD COLUMN IF NOT EXISTS sort_order DOUBLE PRECISION;

NOTIFY pgrst, 'reload schema';
