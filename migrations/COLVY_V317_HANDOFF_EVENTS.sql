-- COLVY_V317_HANDOFF_EVENTS
-- A per-call audit trail of device-handoff ("Switch device") steps, so support
-- can see exactly where a handoff succeeded or stalled — which device requested
-- it, whether the target attempted to accept, whether it promoted to a
-- conference, and whether the new leg confirmed its join.

CREATE TABLE IF NOT EXISTS call_handoff_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id     UUID NOT NULL,
  company_id  UUID,
  event       TEXT NOT NULL,           -- requested | accept_attempt | promoted | joining | confirmed | cancelled | error
  device_id   TEXT,
  platform    TEXT,                    -- web | ios | android
  user_id     UUID,
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_handoff_events_call_idx ON call_handoff_events (call_id, created_at);

ALTER TABLE call_handoff_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "manage call_handoff_events" ON call_handoff_events;
CREATE POLICY "manage call_handoff_events" ON call_handoff_events FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
