-- ============================================================
-- COLVY V349 — A CONVERSATION TAKES ITS ASSIGNEE'S OUTLET
--
-- When a team member starts (or first replies to) a conversation it's assigned
-- to them. This makes it land in their outlet too: whenever a conversation is
-- assigned to someone and it has no outlet yet, it gets that person's home
-- outlet (Team → Default outlet, team_members.default_location_id).
--
-- Done as a trigger so it covers every way a conversation gets started or
-- claimed — the inbox, orders, gallery, payment links, outbound SMS/calls, the
-- AI assistant — without each of them having to remember.
--
--   • Never overwrites an outlet that's already set (the customer picked one,
--     the widget located them, or someone chose it by hand).
--   • Marked assigned_auto = true, so it reads as an automatic choice and a
--     manual change later always wins.
--   • Members with no home outlet change nothing.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION conversation_outlet_from_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE home UUID;
BEGIN
  IF NEW.assigned_to IS NULL OR NEW.assigned_location_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;

  SELECT tm.default_location_id INTO home
    FROM team_members tm
   WHERE tm.company_id = NEW.company_id
     AND tm.user_id::text = NEW.assigned_to::text
     AND tm.default_location_id IS NOT NULL
     AND lower(COALESCE(tm.status, 'active')) <> 'removed'
   LIMIT 1;

  IF home IS NOT NULL THEN
    NEW.assigned_location_id := home;
    NEW.assigned_auto := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_outlet_from_assignee ON conversations;
CREATE TRIGGER trg_conversation_outlet_from_assignee
  BEFORE INSERT OR UPDATE OF assigned_to ON conversations
  FOR EACH ROW EXECUTE FUNCTION conversation_outlet_from_assignee();

-- Optional, one-off: give conversations already assigned to someone, but with
-- no outlet, their assignee's home outlet. Uncomment to run.
-- UPDATE conversations c
--    SET assigned_location_id = tm.default_location_id, assigned_auto = true
--   FROM team_members tm
--  WHERE c.assigned_location_id IS NULL
--    AND c.assigned_to IS NOT NULL
--    AND tm.company_id = c.company_id
--    AND tm.user_id::text = c.assigned_to::text
--    AND tm.default_location_id IS NOT NULL
--    AND lower(COALESCE(tm.status, 'active')) <> 'removed';
