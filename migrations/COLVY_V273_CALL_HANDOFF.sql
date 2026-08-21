-- ============================================================
-- COLVY V273 — ACTIVE CALL DEVICE HANDOFF
-- Move a LIVE agent call leg between a user's devices (web ⇄ mobile) without
-- dropping the customer. Reuses the existing warm-transfer conference
-- (colvy-<callId>): the call is promoted into that conference, the receiving
-- device self-joins, and the old agent leg is removed only after the new one is
-- confirmed. One logical call throughout — same calls row, conversation,
-- recording, transcript, timer.
--
-- Two pieces:
--   1. call_devices — a per-device/per-session registry so we can list a user's
--      other devices and route the "Take over call" prompt to the right one.
--   2. handoff state on the calls row (one record, no duplicates).
-- Additive and safe to re-run.
-- ============================================================

-- ── 1. Per-device registry ──────────────────────────────────────────────────
-- device_id is generated + persisted client-side (a stable id per browser via
-- localStorage, per install for mobile). user_id/company_id are the Supabase
-- ids as text so this is tolerant of however callers pass them.
CREATE TABLE IF NOT EXISTS call_devices (
  device_id     TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  company_id    TEXT NOT NULL,
  platform      TEXT,                       -- 'web' | 'ios' | 'android'
  device_name   TEXT,                       -- 'Chrome on Mac', 'Galaxy S26 Ultra'…
  push_token    TEXT,                       -- mobile push token, for backgrounded takeover
  online        BOOLEAN NOT NULL DEFAULT true,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_devices_user
  ON call_devices (user_id, company_id, last_seen_at DESC);

ALTER TABLE call_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage call_devices" ON call_devices;
CREATE POLICY "Anyone can manage call_devices" ON call_devices
  FOR ALL USING (true) WITH CHECK (true);

-- ── 2. Handoff state on the call ────────────────────────────────────────────
ALTER TABLE calls ADD COLUMN IF NOT EXISTS active_device_id         TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS active_device_type       TEXT;   -- 'web'|'ios'|'android'
ALTER TABLE calls ADD COLUMN IF NOT EXISTS active_agent_call_sid    TEXT;   -- Twilio SID of the agent leg currently in the call
ALTER TABLE calls ADD COLUMN IF NOT EXISTS handoff_status           TEXT DEFAULT 'idle';  -- idle|requested|joining|completed|failed|cancelled
ALTER TABLE calls ADD COLUMN IF NOT EXISTS handoff_target_device_id TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS handoff_by_user_id       TEXT;   -- the agent who initiated the handoff (same user owns the target device)
ALTER TABLE calls ADD COLUMN IF NOT EXISTS handoff_token            TEXT;   -- binds a specific handoff; security is the identity gate, this just prevents replay
ALTER TABLE calls ADD COLUMN IF NOT EXISTS handoff_expires_at       TIMESTAMPTZ;

-- ── 3. Realtime: the target device learns of a pending handoff by subscribing
-- to its calls row. Ensure `calls` is in the realtime publication (idempotent;
-- it may already have been enabled manually in the dashboard).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'calls'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE calls;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
