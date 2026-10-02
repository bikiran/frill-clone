-- COLVY_V322_TICKET_SLA
-- Ticket deadlines (SLAs): first-response and resolution targets per priority,
-- overdue alerts, and optional auto-assignment. Idempotent.

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;   -- first agent reply
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;         -- set on resolved/closed, cleared on reopen
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS sla_breach_notified_at TIMESTAMPTZ; -- one overdue alert per ticket
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_to UUID;                -- (V318 added it; kept for safety)

-- Per-company targets + auto-assign toggle.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS ticket_sla_settings JSONB DEFAULT '{}'::jsonb;

-- Backfill: first agent reply already on the thread.
UPDATE support_tickets t SET first_response_at = m.first_out
FROM (
  SELECT ticket_id, MIN(created_at) AS first_out
  FROM ticket_messages WHERE direction = 'out' AND kind = 'reply'
  GROUP BY ticket_id
) m
WHERE m.ticket_id = t.id AND t.first_response_at IS NULL;

-- Backfill: tickets already resolved/closed count as resolved at their last update.
UPDATE support_tickets SET resolved_at = COALESCE(updated_at, created_at)
WHERE status IN ('resolved', 'closed') AND resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_company_status ON support_tickets(company_id, status);

NOTIFY pgrst, 'reload schema';
