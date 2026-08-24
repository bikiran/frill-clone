-- ============================================================
-- COLVY V287 — BACKFILL: credit past payment-link payments in Link Reports
--
-- Payments confirmed by the verify-payment poll (rather than the Stripe
-- webhook) never wrote a link_conversions row, so a paid payment link showed
-- Revenue "—" in Link Reports. The code fix (confirmChatPayment now credits
-- the link on BOTH paths) covers all FUTURE payments. This one-off backfill
-- credits the ones that already succeeded.
--
-- For every PAID chat payment whose message links a colvy .../l/<code> short
-- URL, it inserts the missing 'paid' link_conversion. Idempotent — skips any
-- link that already has a matching paid conversion. Safe to re-run.
-- ============================================================

INSERT INTO link_conversions
  (company_id, link_id, contact_id, order_id, order_number, stage, revenue, currency, clicked_at, converted_at)
SELECT
  cp.company_id,
  sl.id,
  sl.contact_id,
  'pay_' || cp.id::text,
  NULL,
  'paid',
  (COALESCE(cp.amount_cents, 0)::numeric) / 100,
  'aud',
  COALESCE(cp.created_at, now()),
  COALESCE(cp.created_at, now())
FROM chat_payments cp
JOIN messages m ON m.id = cp.message_id
JOIN short_links sl
  ON sl.code = substring(m.message_payload->>'checkout_url' FROM '/l/([A-Za-z0-9_-]+)')
WHERE cp.status = 'paid'
  AND (m.message_payload->>'checkout_url') ~ '/l/[A-Za-z0-9_-]+'
  AND NOT EXISTS (
    SELECT 1 FROM link_conversions lc
    WHERE lc.link_id = sl.id
      AND lc.stage = 'paid'
      AND lc.order_id = 'pay_' || cp.id::text
  );
