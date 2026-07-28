-- ============================================================
-- COLVY V182 — WEBRTC REGISTRATION CREDENTIALS
--
-- Store the connection username/password the browser registers with, so
-- it becomes a registered SIP endpoint that inbound Call Control can dial.
-- (A JWT-token client connects but does NOT register, so inbound legs
-- dropped in ~1 second — this is the fix.)
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================
ALTER TABLE telnyx_integrations ADD COLUMN IF NOT EXISTS reg_username TEXT;
ALTER TABLE telnyx_integrations ADD COLUMN IF NOT EXISTS reg_password TEXT;
NOTIFY pgrst, 'reload schema';
