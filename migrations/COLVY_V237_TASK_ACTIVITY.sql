-- ============================================================
-- COLVY V237 — TASK ACTIVITY / CARD HISTORY
-- A per-task audit trail shown inside each task card: status moves, assignee
-- changes, priority, due date, edits, etc. Works for tasks from either source
-- (calendar_events or conversation_tasks) because it keys on the task id used by
-- the board. Additive and safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS task_activity (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     text NOT NULL,
  company_id  text,
  actor_id    text,
  actor_name  text,
  kind        text,            -- status | assignee | priority | due | checklist | edit
  detail      text,            -- human-readable summary
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_activity_task_idx ON task_activity (task_id, created_at);

NOTIFY pgrst, 'reload schema';
