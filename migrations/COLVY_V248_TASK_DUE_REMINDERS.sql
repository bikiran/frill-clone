-- Task-due reminders.
--
-- A scheduled job (/api/cron/task-reminders) pushes a phone notification when a
-- task's due date arrives and it isn't done yet, to the assignee(s) + mentioned
-- users. These columns mark a task as already reminded so it only ever pings
-- once — kept separate from calendar_events.reminded_at, which drives the
-- unrelated in-app/email/SMS calendar reminders, so the two never interfere.

ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS due_reminded_at timestamptz;
ALTER TABLE calendar_events    ADD COLUMN IF NOT EXISTS push_reminded_at timestamptz;

-- The cron filters on (due, not done, not yet reminded).
CREATE INDEX IF NOT EXISTS idx_conv_tasks_due_reminder
  ON conversation_tasks (due_date)
  WHERE due_date IS NOT NULL AND done = false AND due_reminded_at IS NULL;

NOTIFY pgrst, 'reload schema';
