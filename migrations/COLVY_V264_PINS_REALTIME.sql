-- COLVY V264 — REALTIME FOR CONVERSATION PINS
--
-- Lets the web inbox live-sync per-user pins across devices and tabs: a pin
-- made in the mobile app (or another browser) appears without a reload, as long
-- as it reached the conversation_pins table. REPLICA IDENTITY FULL so DELETE
-- (unpin) events carry user_id and match the realtime filter.

ALTER TABLE conversation_pins REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversation_pins'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversation_pins;
  END IF;
END $$;
