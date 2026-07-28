-- ============================================================
-- COLVY V133 — SMART CLAIM TRIGGER + SUPPORT TICKETS
-- Run in small steps (conversations is a hot table).
-- Safe to re-run.
-- ============================================================

-- STEP 1 — flag so a claim is only auto-offered once per conversation
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS claim_offered BOOLEAN DEFAULT false;

-- STEP 2 — support tickets raised from a conversation
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  ticket_number TEXT NOT NULL,           -- human-friendly, e.g. TICK-1042
  conversation_id UUID,
  contact_id UUID,
  subject TEXT,
  description TEXT,
  priority TEXT DEFAULT 'normal',        -- low | normal | high | urgent
  status TEXT DEFAULT 'open',            -- open | in_progress | resolved | closed
  assigned_to UUID,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tickets_company ON support_tickets(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_conversation ON support_tickets(conversation_id);
CREATE UNIQUE INDEX IF NOT EXISTS tickets_number_uniq ON support_tickets(company_id, ticket_number);
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage support_tickets" ON support_tickets;
CREATE POLICY "Anyone can manage support_tickets" ON support_tickets FOR ALL USING (true);

-- STEP 3 — per-company ticket counter for sequential numbers
CREATE TABLE IF NOT EXISTS ticket_counters (
  company_id UUID PRIMARY KEY,
  last_number INTEGER DEFAULT 1000
);
ALTER TABLE ticket_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage ticket_counters" ON ticket_counters;
CREATE POLICY "Anyone can manage ticket_counters" ON ticket_counters FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
