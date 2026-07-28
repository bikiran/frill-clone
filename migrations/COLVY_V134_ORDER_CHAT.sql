-- ============================================================
-- COLVY V134 — ORDER-TRIGGERED CHAT AUTOMATION
-- When a WooCommerce order is created / changes status, optionally
-- start (or continue) a chat with a status-appropriate message.
-- Config lives on the company; per-status messages are editable.
-- Safe to re-run.
-- ============================================================

-- { enabled: true, review_url: '...', messages: { processing: '...', failed: '...', ... } }
ALTER TABLE companies ADD COLUMN IF NOT EXISTS order_chat_automation JSONB;

-- Track which order events we've already messaged about, so a webhook firing
-- twice (WooCommerce retries) doesn't double-post.
CREATE TABLE IF NOT EXISTS order_chat_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  order_id BIGINT NOT NULL,
  status TEXT NOT NULL,
  conversation_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS order_chat_events_uniq ON order_chat_events(company_id, order_id, status);
ALTER TABLE order_chat_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage order_chat_events" ON order_chat_events;
CREATE POLICY "Anyone can manage order_chat_events" ON order_chat_events FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
