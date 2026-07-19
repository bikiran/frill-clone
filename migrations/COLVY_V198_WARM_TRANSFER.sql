-- ============================================================
-- COLVY V198 — WARM TRANSFER / INTERNAL RINGING
--
-- Holding a customer while you consult a colleague can't be done with a plain
-- two-leg bridge: bridged legs hear each other or nothing, with no way to hold
-- one side and talk to a third party. The call is moved into a Telnyx
-- conference instead, where participants are held and unheld individually.
--
-- Leg roles in a transfer:
--   customer  — the caller, held while agents consult
--   agent     — whoever answered originally
--   consult   — the colleague being rung internally
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE calls ADD COLUMN IF NOT EXISTS conference_id        TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS conference_name      TEXT;
-- The colleague's leg, so it can be held, unheld or hung up independently.
ALTER TABLE calls ADD COLUMN IF NOT EXISTS consult_call_control_id TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS consult_user_id      UUID;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS consult_name         TEXT;
-- none / ringing / consulting / completed / declined / cancelled
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transfer_state       TEXT DEFAULT 'none';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS customer_on_hold     BOOLEAN DEFAULT FALSE;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transfer_started_at  TIMESTAMPTZ;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transferred_at       TIMESTAMPTZ;

-- Who the call currently belongs to (set when a transfer completes).
ALTER TABLE calls ADD COLUMN IF NOT EXISTS assigned_to UUID;

-- Optional hold music. Telnyx plays silence when this isn't set, which sounds
-- like a dropped call — worth pointing at a short looping MP3.
ALTER TABLE telnyx_integrations ADD COLUMN IF NOT EXISTS hold_music_url TEXT;

CREATE INDEX IF NOT EXISTS idx_calls_conference
  ON calls (conference_id) WHERE conference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_consult_user
  ON calls (consult_user_id, transfer_state)
  WHERE consult_user_id IS NOT NULL;

-- Audit trail: who was rung, by whom, and how it ended.
CREATE TABLE IF NOT EXISTS call_transfers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL,
  call_id        UUID NOT NULL,
  from_user_id   UUID,
  from_name      TEXT,
  to_user_id     UUID,
  to_name        TEXT,
  -- ringing / consulting / completed / declined / cancelled / failed
  outcome        TEXT NOT NULL DEFAULT 'ringing',
  hold_seconds   INTEGER,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_call_transfers_call
  ON call_transfers (call_id, created_at DESC);

ALTER TABLE call_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS call_transfers_all ON call_transfers;
CREATE POLICY call_transfers_all ON call_transfers
  FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
