-- ============================================================
-- COLVY V290 — CALL CONFERENCE HANDOFF FLAG
-- When an agent puts a Twilio call on hold (or starts a warm transfer), both
-- legs are moved into a conference. Moving the customer (parent) leg tears down
-- the <Dial> bridge, which would hang up the agent's browser (child) leg. This
-- flag lets the Dial's action webhook (inbound-status) re-join the parent leg
-- into the SAME conference instead of hanging up, so neither side drops.
-- Holds the conference name while a handoff is in flight; cleared once done.
-- Safe to re-run.
-- ============================================================

ALTER TABLE calls ADD COLUMN IF NOT EXISTS conference_pending TEXT;

NOTIFY pgrst, 'reload schema';
