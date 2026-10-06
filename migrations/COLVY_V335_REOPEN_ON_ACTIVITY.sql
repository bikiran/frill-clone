-- COLVY V335 — Closed enquiries reopen on new activity
--
-- When a closed conversation gets something new from the customer's side — a
-- message (SMS, email, chat, social), an order, a payment, an abandoned cart, a
-- booking, a call, a waitlist sign-up — it moves back to Open on its own, with
-- a "Reopened" entry on its timeline.
--
-- Messages arrive through many routes, so this lives in the database as one
-- trigger on messages rather than in every route:
--   * sender_type 'visitor' (the customer) and 'system' (activity cards) reopen
--   * sender_type 'agent' never does — a team reply, broadcast, review request
--     or restock text going out shouldn't drag a closed thread back
--   * merged / archived conversations stay put
--   * a message can opt out with metadata->>'no_reopen' = 'true'
-- Safe to run more than once.

CREATE OR REPLACE FUNCTION colvy_reopen_on_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  conv RECORD;
BEGIN
  IF NEW.conversation_id IS NULL THEN RETURN NEW; END IF;
  IF coalesce(NEW.sender_type, '') NOT IN ('visitor', 'system') THEN RETURN NEW; END IF;
  IF coalesce(NEW.metadata->>'no_reopen', '') = 'true' THEN RETURN NEW; END IF;

  -- Only flip a closed, un-archived conversation; the row lock stops two
  -- messages arriving together from logging two "Reopened" entries.
  SELECT id, company_id, status INTO conv
    FROM conversations
   WHERE id = NEW.conversation_id
     AND status IN ('closed', 'resolved')
     AND coalesce(is_archived, false) = false
   FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  UPDATE conversations SET status = 'open' WHERE id = conv.id;

  BEGIN
    INSERT INTO conversation_events (conversation_id, company_id, event_type, actor_name, detail, metadata)
    VALUES (
      conv.id, conv.company_id, 'reopened', 'Colvy',
      CASE WHEN NEW.sender_type = 'visitor' THEN 'Reopened — new message from the customer.'
           ELSE 'Reopened — new activity on this enquiry.' END,
      jsonb_build_object('auto', true, 'message_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    -- The timeline entry is a nice-to-have; never block the message over it.
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reopen_on_activity ON messages;
CREATE TRIGGER trg_reopen_on_activity
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION colvy_reopen_on_activity();
