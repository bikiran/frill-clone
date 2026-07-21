-- ============================================================
-- COLVY V203 — TASK BOARD
--
-- The tasks page is becoming a proper board (Today / Overdue / Upcoming /
-- Completed, list/board/timeline views, order links, comments). That needs a
-- few fields the simple checkbox tasks never had.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- A board needs a status beyond the done boolean, plus priority for sorting.
ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS status     TEXT DEFAULT 'todo';   -- todo | in_progress | done
ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS priority   TEXT DEFAULT 'normal'; -- low | normal | high
ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS title      TEXT;                  -- short title (text stays as the body/detail)

-- Link a task to a WooCommerce order so "chase this refund" carries context.
ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS order_id        TEXT;
ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS order_number    TEXT;
ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS order_customer  TEXT;
ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS order_total     NUMERIC;

CREATE INDEX IF NOT EXISTS idx_conv_tasks_company_status
  ON conversation_tasks (company_id, status, due_date);

-- Comments / activity thread on a task.
CREATE TABLE IF NOT EXISTS task_comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID REFERENCES conversation_tasks(id) ON DELETE CASCADE,
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  author_id    UUID,
  author_name  TEXT,
  body         TEXT NOT NULL,
  mentions     JSONB DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_comments ON task_comments (task_id, created_at);
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage task_comments" ON task_comments;
CREATE POLICY "Anyone can manage task_comments" ON task_comments FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
