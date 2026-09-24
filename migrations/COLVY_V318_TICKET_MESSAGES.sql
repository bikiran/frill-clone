-- COLVY_V318_TICKET_MESSAGES
-- Reply thread + internal notes for support tickets, so the redesigned ticket
-- detail page can show a conversation (agent replies to the requester) and
-- staff-only notes, the way the inbox does. Idempotent.

CREATE TABLE IF NOT EXISTS ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL,
  company_id UUID NOT NULL,
  kind TEXT NOT NULL DEFAULT 'reply',      -- 'reply' (visible to requester) | 'note' (internal)
  direction TEXT NOT NULL DEFAULT 'out',   -- 'in' (from requester) | 'out' (from agent)
  body TEXT,
  author_name TEXT,
  author_id UUID,
  emailed BOOLEAN DEFAULT false,           -- true once a reply was sent out by email
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_company ON ticket_messages(company_id);

ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage ticket_messages" ON ticket_messages;
CREATE POLICY "Anyone can manage ticket_messages" ON ticket_messages FOR ALL USING (true);

-- A couple of columns the redesigned pages read that some ticket tables lack.
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

NOTIFY pgrst, 'reload schema';
