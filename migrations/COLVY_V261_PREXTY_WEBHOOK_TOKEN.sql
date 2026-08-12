-- COLVY V261 — PREXTY WEBHOOK TOKEN
--
-- Per-company secret used to authenticate Prexty's inbound order webhook. The
-- callback URL handed to Prexty is:
--   https://<host>/api/webhooks/prexty?t=<webhook_token>
-- so a POST is only trusted if it carries a token that maps to a company. The
-- receiver also accepts the X-Prexty API key as a fallback authenticator.

ALTER TABLE prexty_integrations
  ADD COLUMN IF NOT EXISTS webhook_token TEXT;

-- Backfill existing rows with a random token.
UPDATE prexty_integrations
  SET webhook_token = replace(gen_random_uuid()::text, '-', '')
  WHERE webhook_token IS NULL;

-- New rows get one automatically.
ALTER TABLE prexty_integrations
  ALTER COLUMN webhook_token SET DEFAULT replace(gen_random_uuid()::text, '-', '');

CREATE UNIQUE INDEX IF NOT EXISTS prexty_webhook_token_uniq
  ON prexty_integrations(webhook_token);
