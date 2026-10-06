-- COLVY V332 — automatic abandoned-cart message
--
-- Optional (off by default): one SMS/email to a shopper who left checkout,
-- sent a set time after their last cart activity. These columns record that
-- the message went out, so each cart is only ever messaged once.
-- Safe to run more than once.

ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS recovery_sent_at TIMESTAMPTZ;
ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS recovery_channel TEXT;   -- sms | email | live_chat | none
ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS recovery_error TEXT;

-- The cron looks for un-messaged abandoned carts per company.
CREATE INDEX IF NOT EXISTS idx_abandoned_recovery_due
  ON abandoned_carts (company_id, updated_at)
  WHERE status = 'abandoned' AND recovery_sent_at IS NULL;

NOTIFY pgrst, 'reload schema';
