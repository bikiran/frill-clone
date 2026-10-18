-- COLVY V393: line up conversation_tasks.status with the done checkbox
--
-- Timing: any time, before or after deploy. Safe to run more than once.
--
-- The inbox's task checkbox used to save only `done`, while the Tasks page
-- (and its board) reads `status` first. So a task ticked in a conversation
-- still showed as open on the Tasks page. The inbox now saves both; this
-- fixes the rows ticked (or unticked) there before that.
--
-- Rollback: nothing to undo (it only copies `done` into `status`). To see
-- which rows it touched, run the two SELECTs below before the UPDATEs.

DO $$
BEGIN
  IF to_regclass('public.conversation_tasks') IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'conversation_tasks' AND column_name = 'status') THEN
    RETURN;
  END IF;

  -- SELECT id, text FROM conversation_tasks WHERE done IS TRUE AND status IS DISTINCT FROM 'done';
  UPDATE conversation_tasks
     SET status = 'done'
   WHERE done IS TRUE AND status IS DISTINCT FROM 'done';

  -- SELECT id, text FROM conversation_tasks WHERE done IS NOT TRUE AND status = 'done';
  UPDATE conversation_tasks
     SET status = 'todo'
   WHERE done IS NOT TRUE AND status = 'done';

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'conversation_tasks' AND column_name = 'completed_at') THEN
    UPDATE conversation_tasks SET completed_at = COALESCE(created_at, now())
     WHERE status = 'done' AND completed_at IS NULL;
    UPDATE conversation_tasks SET completed_at = NULL
     WHERE status IS DISTINCT FROM 'done' AND completed_at IS NOT NULL;
  END IF;
END $$;
