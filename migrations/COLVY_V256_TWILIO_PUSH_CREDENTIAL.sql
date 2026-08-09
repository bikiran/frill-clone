-- ============================================================
-- COLVY V256 — TWILIO PUSH CREDENTIAL FOR MOBILE CALLS
-- The mobile Twilio Voice SDK receives incoming calls via an FCM push that
-- Twilio only sends when the Access Token's VoiceGrant names a Push Credential.
-- Without it the phone registers but the invite never arrives, so inbound calls
-- only ever reached the browser. Store the Twilio Push Credential SID (e.g.
-- CRxxxxxxxx…) per company so /api/twilio/token can add push_credential_sid to
-- the grant. Safe to re-run.
-- ============================================================

ALTER TABLE twilio_integrations
  ADD COLUMN IF NOT EXISTS push_credential_sid text;
