-- ============================================================
-- COLVY V159 — REPAIR SUPPORT TICKETS SCHEMA
-- A support_tickets table already exists in some databases but is
-- MISSING columns (e.g. company_id), and because V133 used
-- CREATE TABLE IF NOT EXISTS it silently skipped and never added them.
-- That's why ticket creation failed with:
--   "Could not find the 'company_id' column of 'support_tickets'"
-- This adds every column the app writes. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS ticket_number TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS conversation_id UUID;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS contact_id UUID;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_tickets_company ON support_tickets(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_conversation ON support_tickets(conversation_id);
CREATE UNIQUE INDEX IF NOT EXISTS tickets_number_uniq ON support_tickets(company_id, ticket_number);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage support_tickets" ON support_tickets;
CREATE POLICY "Anyone can manage support_tickets" ON support_tickets FOR ALL USING (true);

-- Per-company ticket counter for sequential numbers.
CREATE TABLE IF NOT EXISTS ticket_counters (
  company_id UUID PRIMARY KEY,
  last_number INTEGER DEFAULT 1000
);
ALTER TABLE ticket_counters ADD COLUMN IF NOT EXISTS last_number INTEGER DEFAULT 1000;
ALTER TABLE ticket_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage ticket_counters" ON ticket_counters;
CREATE POLICY "Anyone can manage ticket_counters" ON ticket_counters FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
