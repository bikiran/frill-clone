-- ============================================================
-- COLVY V153 — ENABLE REALTIME ON CHAT TABLES
-- Adds messages/conversations/notifications to the Supabase realtime
-- publication so agent replies appear in the customer's widget instantly
-- instead of waiting for the 4-second polling fallback.
-- Safe to re-run (each ADD is guarded).
-- ============================================================

-- REPLICA IDENTITY FULL lets realtime send the full row on updates/deletes.
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE conversations REPLICA IDENTITY FULL;
ALTER TABLE notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  -- messages
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;

  -- conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;

  -- notifications (powers the browser notifications in the admin)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

-- Verify: this should list the three tables above.
-- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

NOTIFY pgrst, 'reload schema';
