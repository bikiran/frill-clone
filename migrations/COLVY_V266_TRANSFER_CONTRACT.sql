-- COLVY V266 — WARM-TRANSFER CONTRACT COLUMNS (mobile ⇄ backend)
--
-- The mobile app is now a thin client for warm transfer: it POSTs intents to
-- /api/twilio/call-transfer and renders whatever the backend writes onto the
-- calls row (Supabase realtime, filtered by id). The locked contract
-- (colvy-mobile docs/CALL_TRANSFER.md) needs three columns the row didn't have.
--
--   transfer_with        colleague display name — powers "Talking to …"
--   transfer_talking_to  'customer' | 'colleague' — who the agent is bridged to
--                        ('colleague' ⇒ the customer is on hold music)
--   conference_sid       Twilio Conference SID (bookkeeping; app doesn't read it)
--
-- transfer_state already exists (V198): null/idle · ringing · active ·
-- completed · cancelled. conference_id/conference_name also already exist; the
-- endpoint mirrors the SID into conference_sid to satisfy the contract's name.

ALTER TABLE calls ADD COLUMN IF NOT EXISTS transfer_with        TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transfer_talking_to  TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS conference_sid       TEXT;
