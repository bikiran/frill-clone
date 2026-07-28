-- ============================================================
-- COLVY V185 — AGENT CALL LEG ID
-- Store the agent (browser) leg's call_control_id alongside the caller leg,
-- so a hangup from EITHER side can tear down the other (browser End now
-- drops the phone, and vice versa).
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================
ALTER TABLE calls ADD COLUMN IF NOT EXISTS agent_call_control_id TEXT;
NOTIFY pgrst, 'reload schema';
