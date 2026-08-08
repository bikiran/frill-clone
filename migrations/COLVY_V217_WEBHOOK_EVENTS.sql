-- ============================================================
-- COLVY V217 — WEBHOOK EVENTS LOG
-- A lightweight, append-only record of every inbound webhook Colvy
-- receives (Telnyx, Stripe, Meta, WooCommerce, inbound email). Powers the
-- Webhook Explorer in the Super Admin console so operators can see traffic,
-- spot failures and inspect payloads. Best-effort: written fire-and-forget
-- from the webhook handlers and never blocks message processing. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source       TEXT NOT NULL,             -- telnyx | stripe | meta | woocommerce | email
  event_type   TEXT,                      -- provider event/topic name
  company_id   UUID,                      -- resolved where cheaply available
  status       TEXT DEFAULT 'received',   -- received | processed | ignored | error | rejected
  error        TEXT,                      -- populated when status = error/rejected
  payload      JSONB,                     -- trimmed copy of the inbound body
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_source  ON webhook_events(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_company ON webhook_events(company_id, created_at DESC);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage webhook_events" ON webhook_events;
CREATE POLICY "Anyone can manage webhook_events" ON webhook_events FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
