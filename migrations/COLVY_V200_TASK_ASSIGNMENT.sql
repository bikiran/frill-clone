-- ============================================================
-- COLVY V200 — TASK ASSIGNMENT
--
-- conversation_tasks already had assigned_to, but as a bare TEXT name. That's
-- enough to display and no use for anything else: you can't notify a name, and
-- "Bikiran" typed two different ways is two different people.
--
-- Adding the user id makes a task addressable — it can raise a notification,
-- and "my tasks" becomes answerable.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS assigned_to_id  UUID;
ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS created_by      TEXT;
ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS created_by_id   UUID;
-- Team members named with @ inside the task text.
ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS mentions        JSONB DEFAULT '[]'::jsonb;
ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS completed_at    TIMESTAMPTZ;
ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS completed_by    TEXT;

CREATE INDEX IF NOT EXISTS idx_conv_tasks_assignee
  ON conversation_tasks (assigned_to_id, done)
  WHERE assigned_to_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
