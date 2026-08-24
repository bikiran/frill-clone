-- ============================================================
-- COLVY V289 — PAYMENT CARD METADATA
-- Stores the card brand + last-4 on the payment when it's confirmed, so the
-- Payments list can show the method per row without a Stripe call per row.
-- Safe to re-run.
-- ============================================================

ALTER TABLE chat_payments ADD COLUMN IF NOT EXISTS card_brand TEXT;
ALTER TABLE chat_payments ADD COLUMN IF NOT EXISTS card_last4 TEXT;

NOTIFY pgrst, 'reload schema';
