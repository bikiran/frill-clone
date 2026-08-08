-- ============================================================
-- COLVY V226 — ATTACHMENTS ON CALENDAR EVENTS & TASKS
-- Photos/videos can now be attached to calendar events (delivery, appointment,
-- booking, pickup, task) and to tasks on the Tasks page. Stored as a JSONB
-- array of { url, name, type, kind, size }. Additive and safe to re-run.
-- ============================================================

ALTER TABLE calendar_events   ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
