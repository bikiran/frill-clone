-- ============================================================
-- COLVY V238 — REALTIME FOR THE TASKS BOARD
-- Add the two task-backing tables to the supabase_realtime publication so the
-- Tasks page updates live (INSERT/UPDATE/DELETE) without a manual reload.
-- Guarded so it's safe to re-run: adding a table already in the publication
-- would otherwise error.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversation_tasks'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE conversation_tasks';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'calendar_events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE calendar_events';
  END IF;
END $$;

-- Optional but recommended so UPDATE/DELETE payloads carry the changed row's
-- identity for filtering. Safe to re-run.
ALTER TABLE conversation_tasks REPLICA IDENTITY FULL;
ALTER TABLE calendar_events REPLICA IDENTITY FULL;
