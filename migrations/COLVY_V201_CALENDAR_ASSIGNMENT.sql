-- ============================================================
-- COLVY V201 — CALENDAR EVENT ASSIGNMENT & REMINDER CHANNELS
--
-- Calendar events could be scoped to an outlet but not to a person, and
-- reminders had no notion of HOW to remind. This adds:
--   - assignment to a specific team member
--   - which channels to remind them on (in-app / email / SMS)
--   - an optional customer-facing reminder for delivery/appointment/booking/
--     pickup events
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS assigned_to_id   UUID;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS assigned_to_name TEXT;

-- Which channels to remind the assigned team member on. Defaults to all three.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS reminder_channels JSONB
  DEFAULT '["in_app","email","sms"]'::jsonb;

-- Optional customer reminder (delivery / appointment / booking / pickup).
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS notify_customer      BOOLEAN DEFAULT FALSE;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS customer_contact_id  UUID;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS customer_reminded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_calendar_assignee
  ON calendar_events (assigned_to_id, starts_at)
  WHERE assigned_to_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
