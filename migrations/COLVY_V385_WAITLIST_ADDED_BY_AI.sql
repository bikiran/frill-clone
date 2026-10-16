-- ============================================================
-- COLVY V385 — WAITLIST ENTRIES ADDED BY AI
--
-- The AI agents (Support, Sales) can now add a customer who asks "let me know
-- when it's back" to the back-in-stock waitlist themselves, and staff can ask
-- Colvy AI to do it ("add Thi to the waitlist for the bristlenose"). The
-- Waitlists page marks those entries "Added by AI", says who added them and
-- links to the run that did it ("Why?").
--
-- stock_waitlist.source gains two values (it is plain text, nothing to alter):
--   ai_agent  — an AI agent added them from a conversation
--   colvy_ai  — Colvy AI added them when a team member asked
--
-- New nullable columns:
--   stock_waitlist.agent_run_id  uuid  the agent run that added them (agent_runs.id)
--   stock_waitlist.added_by      text  who, in words: "Colvy AI (Support Agent)",
--                                      "Colvy AI (requested by Sam)"
--
-- plus an index for the "Added by AI" filter.
--
-- Waitlist notes (staff-only messages with metadata.waitlist) no longer become
-- the conversation's preview in the inbox list: the V299 bump trigger is
-- re-created with that one exception (everything else it does is unchanged,
-- including moving last_message_at). Previews already showing an old note are
-- tidied when the list renders. Existing rows keep NULL and their
-- source. Until this runs, AI-added entries are still saved (without the two
-- columns) and still show as added by AI from their source.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE stock_waitlist ADD COLUMN IF NOT EXISTS agent_run_id UUID;
ALTER TABLE stock_waitlist ADD COLUMN IF NOT EXISTS added_by TEXT;
CREATE INDEX IF NOT EXISTS idx_waitlist_company_source ON stock_waitlist(company_id, source);

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
       AND COALESCE(NEW.metadata->>'waitlist', '') <> 'true'
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

NOTIFY pgrst, 'reload schema';
