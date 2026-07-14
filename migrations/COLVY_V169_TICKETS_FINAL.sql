-- ============================================================
-- COLVY V169 — SUPPORT TICKETS, THE ACTUAL FIX
--
-- The real error was finally visible:
--   null value in column "email" of relation "support_tickets"
--   violates not-null constraint
--
-- So the table exists and has company_id — but an OLDER version of
-- support_tickets is still there carrying columns the app never
-- writes ("email", possibly others), and they're NOT NULL. Every
-- insert therefore failed, no matter how many times the columns
-- were re-added. Adding columns was never going to fix a constraint
-- on a DIFFERENT column.
--
-- This drops NOT NULL from every column the app doesn't populate,
-- leaving the app's own columns intact. Nothing is deleted.
--
-- Run this whole file in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- Make sure the table and the app's columns exist (idempotent).
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

-- ── THE FIX ──────────────────────────────────────────────────
-- Drop NOT NULL from every column that isn't one the app fills in.
-- ("email" is the one that bit us; this catches any siblings too.)
DO $$
DECLARE
  col RECORD;
BEGIN
  FOR col IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'support_tickets'
      AND is_nullable = 'NO'
      AND column_default IS NULL
      AND column_name NOT IN ('id')          -- the PK must stay NOT NULL
  LOOP
    EXECUTE format('ALTER TABLE support_tickets ALTER COLUMN %I DROP NOT NULL', col.column_name);
    RAISE NOTICE 'Dropped NOT NULL from support_tickets.%', col.column_name;
  END LOOP;
END $$;

-- Indexes / RLS (idempotent).
CREATE INDEX IF NOT EXISTS idx_tickets_company ON support_tickets(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_conversation ON support_tickets(conversation_id);
CREATE UNIQUE INDEX IF NOT EXISTS tickets_number_uniq ON support_tickets(company_id, ticket_number);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage support_tickets" ON support_tickets;
CREATE POLICY "Anyone can manage support_tickets" ON support_tickets FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS ticket_counters (
  company_id UUID PRIMARY KEY,
  last_number INTEGER DEFAULT 1000
);
ALTER TABLE ticket_counters ADD COLUMN IF NOT EXISTS last_number INTEGER DEFAULT 1000;
ALTER TABLE ticket_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage ticket_counters" ON ticket_counters;
CREATE POLICY "Anyone can manage ticket_counters" ON ticket_counters FOR ALL USING (true);

-- ── Cache-proof fallback (the RPC "not found in the schema cache"
--    error means PostgREST hadn't reloaded; recreated + reloaded below).
DROP FUNCTION IF EXISTS colvy_create_ticket(UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION colvy_create_ticket(
  p_company_id UUID,
  p_conversation_id UUID DEFAULT NULL,
  p_contact_id UUID DEFAULT NULL,
  p_subject TEXT DEFAULT 'Support request',
  p_description TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT 'normal',
  p_created_by UUID DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INTEGER;
  v_row support_tickets;
BEGIN
  INSERT INTO ticket_counters (company_id, last_number)
  VALUES (p_company_id, 1001)
  ON CONFLICT (company_id)
  DO UPDATE SET last_number = ticket_counters.last_number + 1
  RETURNING last_number INTO v_next;

  WHILE EXISTS (
    SELECT 1 FROM support_tickets
    WHERE company_id = p_company_id AND ticket_number = 'TICK-' || v_next
  ) LOOP
    v_next := v_next + 1;
    UPDATE ticket_counters SET last_number = v_next WHERE company_id = p_company_id;
  END LOOP;

  INSERT INTO support_tickets (
    company_id, ticket_number, conversation_id, contact_id,
    subject, description, priority, status, created_by
  ) VALUES (
    p_company_id, 'TICK-' || v_next, p_conversation_id, p_contact_id,
    p_subject, p_description, COALESCE(p_priority, 'normal'), 'open', p_created_by
  ) RETURNING * INTO v_row;

  RETURN row_to_json(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION colvy_create_ticket TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION colvy_reload_schema() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NOTIFY pgrst, 'reload schema';
END;
$$;
GRANT EXECUTE ON FUNCTION colvy_reload_schema TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Verify: this should list NO rows other than id.
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'support_tickets' AND is_nullable = 'NO';
