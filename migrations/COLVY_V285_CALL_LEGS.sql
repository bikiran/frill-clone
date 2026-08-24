-- ============================================================
-- COLVY V285 — CALL LEGS (per-agent ring tracking)
--
-- On an inbound ring-all, each agent's <Client> leg gets its own Twilio child
-- CallSid. We record childSid → user_id here as the legs ring, so when the Dial
-- action callback fires with the answered leg's DialCallSid (which ALWAYS fires,
-- unlike the per-<Client> "answered" status callback) we can resolve WHICH agent
-- answered — even in a simultaneous multi-agent ring.
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS call_legs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id     UUID NOT NULL,
  company_id  UUID,
  child_sid   TEXT NOT NULL,
  user_id     UUID,
  created_at  TIMESTAMPTZ DEFAULT now()
);
-- One row per child leg; upserts on the SID keep it idempotent across the leg's
-- initiated/ringing/answered callbacks.
CREATE UNIQUE INDEX IF NOT EXISTS uq_call_legs_child_sid ON call_legs (child_sid);
CREATE INDEX IF NOT EXISTS idx_call_legs_call ON call_legs (call_id);

ALTER TABLE call_legs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage call_legs" ON call_legs;
CREATE POLICY "Anyone can manage call_legs" ON call_legs FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
