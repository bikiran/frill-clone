-- ============================================================
-- COLVY V288 — PAYMENT REFUND TRACKING
-- Records refunds against a chat payment so the Payments tab can show how much
-- was refunded (full or partial) and when. Safe to re-run.
-- ============================================================

ALTER TABLE chat_payments ADD COLUMN IF NOT EXISTS refunded_cents INTEGER;
ALTER TABLE chat_payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
