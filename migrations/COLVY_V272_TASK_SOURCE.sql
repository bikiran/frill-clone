-- ============================================================
-- COLVY V272 — TASK SOURCE
-- Records where a task came from, so AI-drafted tasks (created from a call's
-- summary action items) can show a "Call summary" origin tag and be told apart
-- from hand-written tasks. NULL for manual tasks. Additive and safe to re-run.
-- ============================================================

ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS source TEXT;   -- e.g. 'call_summary', 'ai_summary'

NOTIFY pgrst, 'reload schema';
