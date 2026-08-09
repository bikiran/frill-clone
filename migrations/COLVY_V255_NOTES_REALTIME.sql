-- ============================================================
-- COLVY V255 — REALTIME FOR NOTES
-- Add the `notes` table to the supabase_realtime publication so the Notes page
-- (web + mobile) updates live — edits, checklist ticks, new notes, trashes —
-- without a manual reload. Every other realtime surface (messages,
-- conversations, conversation_tasks, calendar_events, media_items) already has
-- an equivalent migration; notes was the one missing.
--
-- Guarded so it's safe to re-run: adding a table already in the publication
-- would otherwise error.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE notes';
  END IF;
END $$;

-- So UPDATE/DELETE payloads carry the changed row's identity for filtering.
-- Safe to re-run.
ALTER TABLE notes REPLICA IDENTITY FULL;
