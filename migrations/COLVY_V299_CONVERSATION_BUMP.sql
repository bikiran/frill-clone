-- ============================================================
-- COLVY V299 — KEEP CONVERSATIONS FRESH ON EVERY NEW MESSAGE
--
-- The inbox list sorts by conversations.last_message_at and shows
-- conversations.last_message as the preview; the "Open" tab hides
-- closed/resolved threads. Those fields are supposed to be updated by whatever
-- ingests a message (the Meta webhook, the SMS/email webhooks, the send route,
-- imports…). When any one path forgets — or updates the message row but not the
-- conversation row — a brand-new inbound message lands in the thread but the
-- conversation doesn't bump to the top and a resolved thread never reopens.
--
-- Rather than trust every current and future insert path to remember, this
-- trigger maintains the conversation row at the database, for EVERY message
-- insert (webhook, API, import, seed) — there is no way around it:
--   • last_message_at  → advanced to the new message's time (never moved
--                        backwards, so a historical/out-of-order insert can't
--                        drag an active thread down the list).
--   • last_message     → the new message's text preview (only when it's the
--                        newest message and has text — an attachment-only or
--                        older message never blanks/rewrites the preview).
--   • status           → a visitor message on a closed/resolved thread reopens
--                        it (status → 'open'); agent/system messages never
--                        reopen a thread.
--   • is_unread        → set on a visitor message (the badge/count is left to
--                        the app so this can't double-count).
--
-- It deliberately does NOT touch unread_count — the app owns that increment, so
-- the trigger overlapping it would double-count.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION colvy_bump_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.conversation_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE conversations c
  SET
    last_message = CASE
      WHEN COALESCE(NEW.content, '') <> ''
       AND NEW.created_at >= COALESCE(c.last_message_at, NEW.created_at)
      THEN LEFT(NEW.content, 200)
      ELSE c.last_message
    END,
    last_message_at = GREATEST(COALESCE(c.last_message_at, NEW.created_at), NEW.created_at),
    status = CASE
      WHEN NEW.sender_type = 'visitor' AND c.status IN ('closed', 'resolved')
      THEN 'open'
      ELSE c.status
    END,
    is_unread = CASE
      WHEN NEW.sender_type = 'visitor' THEN true
      ELSE c.is_unread
    END,
    updated_at = NOW()
  WHERE c.id = NEW.conversation_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bump_conversation_on_message ON messages;
CREATE TRIGGER trg_bump_conversation_on_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION colvy_bump_conversation_on_message();

-- Done.
NOTIFY pgrst, 'reload schema';
