-- ============================================================
-- COLVY V195 — REPAIR CAMPAIGNS TABLE
--
-- V118 already created a small `campaigns` table (id, company_id, name, type,
-- message, status, recipients_count, scheduled_at, sent_at). V194 then used
-- CREATE TABLE IF NOT EXISTS, which silently did NOTHING because the table
-- already existed — so none of the new columns were added and inserts failed
-- with "Could not find the 'channel' column".
--
-- This adds every column the campaign builder needs to whatever is already
-- there, and backfills from the old columns.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- ── Identity / classification ──────────────────────────────────────────────
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS channel        TEXT DEFAULT 'sms';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_type  TEXT DEFAULT 'promotion';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS status         TEXT DEFAULT 'draft';

-- ── Sending identity ───────────────────────────────────────────────────────
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS location_id    UUID;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sender_name    TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sender_number  TEXT;

-- ── Content ────────────────────────────────────────────────────────────────
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS message        TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS attachments    JSONB DEFAULT '[]'::jsonb;

-- ── Audience ───────────────────────────────────────────────────────────────
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS audience_type   TEXT DEFAULT 'all_subscribed';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS audience_filter JSONB DEFAULT '{}'::jsonb;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS audience_count  INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS excluded_count  INTEGER DEFAULT 0;

-- ── Scheduling ─────────────────────────────────────────────────────────────
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS scheduled_at    TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS timezone        TEXT DEFAULT 'Australia/Melbourne';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS quiet_hours     BOOLEAN DEFAULT TRUE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS rate_per_minute INTEGER DEFAULT 60;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS send_local_time BOOLEAN DEFAULT FALSE;

-- ── Delivery counters ──────────────────────────────────────────────────────
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS recipients_total   INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sent_count         INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS delivered_count    INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS failed_count       INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS unsubscribed_count INTEGER DEFAULT 0;

-- ── Cost ───────────────────────────────────────────────────────────────────
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS segments       INTEGER DEFAULT 1;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(12,2) DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS actual_cost    NUMERIC(12,2) DEFAULT 0;

-- ── Bookkeeping ────────────────────────────────────────────────────────────
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS created_by    TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS created_by_id UUID;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sent_at       TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS completed_at  TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();

-- ── Backfill from the old V118 columns ─────────────────────────────────────
-- Those columns only exist if V118 was applied, so create them as no-ops first
-- rather than assuming. Keeps this migration runnable on any database.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS type             TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS recipients_count INTEGER DEFAULT 0;

-- V118 called the channel "type"; keep any existing value.
UPDATE campaigns SET channel = COALESCE(channel, type, 'sms')
WHERE channel IS NULL;

-- V118 counted recipients in recipients_count.
UPDATE campaigns SET recipients_total = COALESCE(recipients_total, recipients_count, 0)
WHERE COALESCE(recipients_total, 0) = 0;

UPDATE campaigns SET status = 'draft' WHERE status IS NULL;
UPDATE campaigns SET channel = 'sms' WHERE channel IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_company_status
  ON campaigns (company_id, status, created_at DESC);

-- PostgREST caches the schema; without this the new columns stay invisible.
NOTIFY pgrst, 'reload schema';
