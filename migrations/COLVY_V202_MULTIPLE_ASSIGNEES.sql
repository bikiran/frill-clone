-- ============================================================
-- COLVY V202 — MULTIPLE ASSIGNEES
--
-- Calendar events and tasks could be assigned to one person. Real work often
-- needs several — a delivery run handled by two drivers, a task two people own.
-- assignees holds the full set; the existing single assigned_to_id is kept and
-- mirrors the first assignee, so nothing that reads the old column breaks.
--
--   assignees: [{ "id": "<user_id>", "name": "Jane" }, ...]
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE calendar_events    ADD COLUMN IF NOT EXISTS assignees JSONB DEFAULT '[]'::jsonb;
ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS assignees JSONB DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
