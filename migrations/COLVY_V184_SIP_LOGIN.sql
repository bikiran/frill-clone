-- ============================================================
-- COLVY V184 — SIP CONNECTION LOGIN CREDENTIALS
--
-- The browser must register on the Credential SIP Connection using its
-- username/password (not a telephony-credential token) to RECEIVE inbound
-- calls — Telnyx's own Authentication tab states this, and the connection
-- shows "Unregistered" because the token auth doesn't register against it.
-- Store the connection's SIP username/password so the client can register.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================
ALTER TABLE telnyx_integrations ADD COLUMN IF NOT EXISTS sip_conn_username TEXT;
ALTER TABLE telnyx_integrations ADD COLUMN IF NOT EXISTS sip_conn_password TEXT;
NOTIFY pgrst, 'reload schema';
ALTER TABLE telnyx_integrations ADD COLUMN IF NOT EXISTS sip_conn_verified BOOLEAN DEFAULT false;
NOTIFY pgrst, 'reload schema';
