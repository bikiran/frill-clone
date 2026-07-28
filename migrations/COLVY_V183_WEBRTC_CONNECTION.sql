-- ============================================================
-- COLVY V183 — DEDICATED WEBRTC CREDENTIAL CONNECTION
--
-- Inbound calling needs TWO Telnyx connections, which were conflated into
-- one: the Voice API App (number routes here, our webhook dials) and a
-- Credential SIP Connection (the browser registers here to RECEIVE the
-- dialed call). A telephony credential on the Voice API app connects but
-- can't receive inbound SIP — the invite is never delivered, so the browser
-- never rings. Store the dedicated WebRTC credential-connection id here.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================
ALTER TABLE telnyx_integrations ADD COLUMN IF NOT EXISTS webrtc_connection_id TEXT;
NOTIFY pgrst, 'reload schema';
