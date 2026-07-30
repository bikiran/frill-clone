-- V211 — Task enhancements: colour coding, outlet tagging, and recurrence.
--
-- Adds three optional columns to conversation_tasks. All are nullable so the app
-- keeps working before this runs (the Tasks UI degrades gracefully), and this
-- migration is safe to re-run.
--
--   color        — a hex colour (e.g. '#3b82f6') for colour-coding a task, or NULL.
--   location_id  — the outlet/location this task belongs to (company_locations.id).
--   recurrence   — the repeat rule, e.g. {"freq":"weekly","interval":1,"days":[1,3,5],"count":8}.
--                  Occurrences are pre-generated as individual task rows; this is
--                  kept on each row so the UI can show a "repeats" badge.

ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS color       TEXT;
ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS location_id UUID;
ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS recurrence  JSONB;

CREATE INDEX IF NOT EXISTS idx_conversation_tasks_location ON conversation_tasks(location_id);
