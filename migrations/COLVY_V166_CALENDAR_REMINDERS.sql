-- ============================================================
-- COLVY V166 — CALENDAR REMINDERS
-- Tells the team about events that are due or coming up, in the
-- notification panel and (optionally) by email. Each event is only
-- ever announced once — reminders that nag are worse than none.
-- Off by default: nobody gets surprise emails.
-- Safe to re-run.
-- ============================================================

-- So we never announce the same event twice.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_calendar_reminders
  ON calendar_events (company_id, starts_at) WHERE reminded_at IS NULL;

-- Per-company reminder settings.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS calendar_settings JSONB DEFAULT '{}'::jsonb;
-- { reminders_enabled: false, lead_hours: 24, email: true }

NOTIFY pgrst, 'reload schema';
