-- ============================================================
-- COLVY V310 — calls.answered_at
--
-- The outbound ringback tone (the "brr-brr" the agent's browser plays while the
-- customer is dialled) is supposed to stop the instant the customer truly
-- answers. Both providers signal that by stamping answered_at on the calls row:
--   • Twilio  — /api/twilio/voice/outbound-child-status (customer leg answered)
--   • Telnyx  — /api/telnyx/webhook (call.answered, role=customer → bridge)
-- and the browser stops the tone when it reads answered_at.
--
-- But this column was never created, so every one of those writes was rejected
-- (unknown column) and the browser's poll SELECT errored — the tone kept playing
-- over the live conversation / voicemail until its 90s safety cap. Adding the
-- column makes the answer signal persist and the ringback stop on real pickup.
--
--   answered_at : timestamptz — when the far end actually answered.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE calls ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
