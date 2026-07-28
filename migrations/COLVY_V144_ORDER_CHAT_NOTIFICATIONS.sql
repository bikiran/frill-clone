-- ============================================================
-- COLVY V144 — NOTIFICATIONS CONVERSATION LINK + ORDER EVENTS
-- Adds conversation_id to notifications so CRM notifications
-- (chat, order, ticket, cart) can deep-link to the inbox thread.
-- Also ensures order_chat_events exists for de-duping order posts.
-- Safe to re-run.
-- ============================================================

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS conversation_id UUID;

CREATE TABLE IF NOT EXISTS order_chat_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  order_id BIGINT,
  status TEXT,
  conversation_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_chat_events ON order_chat_events(company_id, order_id, status);
ALTER TABLE order_chat_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage order_chat_events" ON order_chat_events;
CREATE POLICY "Anyone can manage order_chat_events" ON order_chat_events FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
