-- ============================================================
-- COLVY V230 — RICH TASK DESCRIPTION
-- Tasks get a rich-text description (HTML) authored with a small toolbar —
-- bold/italic/lists/headings/links and tables. Stored as HTML text. Added to
-- both native tasks and calendar-scheduled items. Additive and safe to re-run.
-- ============================================================

ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE calendar_events    ADD COLUMN IF NOT EXISTS description TEXT;

NOTIFY pgrst, 'reload schema';
