-- ============================================================
-- COLVY V194 — CAMPAIGNS (STEP 1: SCHEMA)
--
-- Tables for bulk SMS/email campaigns. This migration only creates structure —
-- nothing in the app sends yet. The send engine arrives in a later step, behind
-- consent and quiet-hour checks.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- ── Campaigns ──────────────────────────────────────────────────────────────
-- NOTE: an earlier migration (V118) may already have created a smaller
-- `campaigns` table. CREATE TABLE IF NOT EXISTS would then silently do nothing
-- and none of the columns below would be added, so run COLVY_V195_REPAIR_CAMPAIGNS.sql
-- after this one — it ADDs every column individually and is safe either way.
CREATE TABLE IF NOT EXISTS campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL,
  name             TEXT NOT NULL,

  -- sms / email (more channels later)
  channel          TEXT NOT NULL DEFAULT 'sms',
  -- promotion / new_arrivals / product_launch / event / review_request
  -- / follow_up / service_announcement / general_update
  campaign_type    TEXT DEFAULT 'promotion',

  -- draft → scheduled → sending → sent
  -- (also: paused, cancelled, failed)
  status           TEXT NOT NULL DEFAULT 'draft',

  -- Sending identity
  location_id      UUID,            -- outlet the campaign is sent "from"
  sender_name      TEXT,
  sender_number    TEXT,

  -- Content
  message          TEXT,
  -- Attached product/coupon/article links, resolved to tracked short links
  attachments      JSONB DEFAULT '[]'::jsonb,

  -- Audience definition. Kept as a filter spec (not a frozen list) so the count
  -- can be recomputed, with the resolved recipients written to
  -- campaign_recipients when the campaign is scheduled or sent.
  audience_type    TEXT DEFAULT 'all_subscribed',
  audience_filter  JSONB DEFAULT '{}'::jsonb,
  audience_count   INTEGER DEFAULT 0,
  excluded_count   INTEGER DEFAULT 0,

  -- Scheduling
  scheduled_at     TIMESTAMPTZ,
  timezone         TEXT DEFAULT 'Australia/Melbourne',
  quiet_hours      BOOLEAN DEFAULT TRUE,
  rate_per_minute  INTEGER DEFAULT 60,

  -- Delivery counters (updated by the send engine)
  recipients_total INTEGER DEFAULT 0,
  sent_count       INTEGER DEFAULT 0,
  delivered_count  INTEGER DEFAULT 0,
  failed_count     INTEGER DEFAULT 0,
  unsubscribed_count INTEGER DEFAULT 0,

  -- Cost estimate at time of send (SMS segments × unit price)
  segments         INTEGER DEFAULT 1,
  estimated_cost   NUMERIC(12,2) DEFAULT 0,
  actual_cost      NUMERIC(12,2) DEFAULT 0,

  created_by       TEXT,
  created_by_id    UUID,
  sent_at          TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_company_status
  ON campaigns (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled
  ON campaigns (status, scheduled_at)
  WHERE status = 'scheduled';

-- ── Per-recipient rows ─────────────────────────────────────────────────────
-- One row per contact per campaign. Recording SKIPPED recipients (with the
-- reason) matters as much as sent ones — it's how "23 contacts were excluded
-- because they unsubscribed" is shown, and it's the audit trail if a send is
-- ever queried.
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID NOT NULL,
  company_id    UUID NOT NULL,
  contact_id    UUID,

  -- Snapshot of the destination at send time, so later contact edits don't
  -- rewrite history.
  phone         TEXT,
  email         TEXT,
  name          TEXT,

  -- pending / sent / delivered / failed / skipped
  status        TEXT NOT NULL DEFAULT 'pending',
  -- unsubscribed / no_consent / blocked / invalid_number / duplicate
  skip_reason   TEXT,

  provider_id   TEXT,          -- Telnyx message id
  error         TEXT,
  link_id       UUID,          -- tracked short link sent to this recipient

  sent_at       TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  clicked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign
  ON campaign_recipients (campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_contact
  ON campaign_recipients (company_id, contact_id);
-- A contact can only appear once per campaign (dedupe protection).
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_recipients_unique
  ON campaign_recipients (campaign_id, contact_id)
  WHERE contact_id IS NOT NULL;

-- ── Reusable message templates ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL,
  name          TEXT NOT NULL,
  channel       TEXT DEFAULT 'sms',
  campaign_type TEXT,
  message       TEXT NOT NULL,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_templates_company
  ON campaign_templates (company_id, created_at DESC);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE campaigns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_templates   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_all ON campaigns;
CREATE POLICY campaigns_all ON campaigns
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS campaign_recipients_all ON campaign_recipients;
CREATE POLICY campaign_recipients_all ON campaign_recipients
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS campaign_templates_all ON campaign_templates;
CREATE POLICY campaign_templates_all ON campaign_templates
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ── Link campaigns to click tracking ───────────────────────────────────────
-- Lets Link Reports and campaign reporting share the same click/conversion data.
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS campaign_id UUID;
CREATE INDEX IF NOT EXISTS idx_short_links_campaign
  ON short_links (campaign_id);

NOTIFY pgrst, 'reload schema';
