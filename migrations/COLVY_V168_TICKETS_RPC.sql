-- ============================================================
-- COLVY V168 — BULLETPROOF SUPPORT TICKETS
--
-- Ticket creation kept failing even after V159 because PostgREST
-- (Supabase's API layer) caches each table's COLUMN LIST. After
-- ALTER TABLE, the cache can stay stale, so inserts fail with
--   "Could not find the 'company_id' column of 'support_tickets'"
-- even though the column exists.
--
-- This migration:
--   1. Re-repairs the table (safe to re-run — idempotent)
--   2. Adds colvy_create_ticket(): a SECURITY DEFINER function that
--      inserts via plain SQL, IMMUNE to the column cache. The API now
--      falls back to it automatically whenever a direct insert fails.
--   3. Forces a schema reload (twice — belt and braces)
--
-- Run the whole file in the Supabase SQL editor. Safe to re-run.
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

CREATE TABLE IF NOT EXISTS ticket_counters (
  company_id UUID PRIMARY KEY,
  last_number INTEGER DEFAULT 1000
);
ALTER TABLE ticket_counters ADD COLUMN IF NOT EXISTS last_number INTEGER DEFAULT 1000;
ALTER TABLE ticket_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage ticket_counters" ON ticket_counters;
CREATE POLICY "Anyone can manage ticket_counters" ON ticket_counters FOR ALL USING (true);

-- ── Cache-proof ticket creation ──────────────────────────────
-- Runs entirely in SQL, so PostgREST's stale column cache can't
-- break it. Also numbers tickets atomically (no counter races).
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
  -- Atomic per-company counter: upsert + increment in one statement.
  INSERT INTO ticket_counters (company_id, last_number)
  VALUES (p_company_id, 1001)
  ON CONFLICT (company_id)
  DO UPDATE SET last_number = ticket_counters.last_number + 1
  RETURNING last_number INTO v_next;

  -- Never collide with an existing ticket number (e.g. counter reset).
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

-- Lets the API force a PostgREST schema-cache reload when it sees a
-- "Could not find the '<column>' column" error, and retry immediately.
CREATE OR REPLACE FUNCTION colvy_reload_schema() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NOTIFY pgrst, 'reload schema';
END;
$$;

GRANT EXECUTE ON FUNCTION colvy_reload_schema TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
SELECT pg_sleep(1);
NOTIFY pgrst, 'reload schema';
