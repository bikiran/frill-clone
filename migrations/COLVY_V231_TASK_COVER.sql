-- ============================================================
-- COLVY V231 — TASK COVER PHOTO
-- A task can nominate one of its image attachments as a cover, shown full-width
-- across the top of its card (Apple-style, title stays below). Stores the
-- chosen image URL. Added to native tasks and calendar-scheduled items.
-- Additive and safe to re-run.
-- ============================================================

ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS cover_image TEXT;
ALTER TABLE calendar_events    ADD COLUMN IF NOT EXISTS cover_image TEXT;

NOTIFY pgrst, 'reload schema';
