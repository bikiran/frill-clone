-- ============================================================
-- COLVY V285 — PREFERRED AGENT PER CONTACT
-- A customer can have a preferred team member. On an inbound call that member
-- rings FIRST (priority); on no answer the call falls back to ringing everyone.
-- Set from the inbox contact panel. Safe to re-run.
--   preferred_agent_user_id → auth user id (matches telnyx_user_credentials.user_id)
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_agent_user_id UUID;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_agent_name TEXT;

-- Two-stage priority ring state on the call: when a preferred agent is dialed
-- first, this holds the remaining SIP targets to fan out to if they don't
-- answer. Cleared once the fan-out fires. { pending, targets, ring, connId, from }
ALTER TABLE calls ADD COLUMN IF NOT EXISTS routing_state JSONB;

NOTIFY pgrst, 'reload schema';
