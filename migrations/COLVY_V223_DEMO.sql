-- ============================================================
-- COLVY V223 — DEMO WORKSPACES
-- Foundations for the demo/showcase system: flags on companies that mark a
-- workspace as a demo and lock external sending, a registry of demo workspaces
-- for the Super Admin console, and a lightweight analytics stream. All additive
-- and safe to re-run. Real tenant workspaces are unaffected (defaults keep
-- is_demo false and external_sending_enabled true).
-- ============================================================

-- Demo flags on the company itself, so server-side guards can check in one read.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_demo                  BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS demo_type                TEXT;      -- shared_showcase | private_sales | internal_testing | trial
ALTER TABLE companies ADD COLUMN IF NOT EXISTS demo_template            TEXT;      -- cafe | retail | automotive | aquarium | ...
ALTER TABLE companies ADD COLUMN IF NOT EXISTS demo_expires_at          TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS external_sending_enabled BOOLEAN DEFAULT true;  -- false = block real SMS/email/calls/messages
ALTER TABLE companies ADD COLUMN IF NOT EXISTS demo_read_only           BOOLEAN DEFAULT false;

-- Registry of demo workspaces, shown and managed in the Super Admin console.
CREATE TABLE IF NOT EXISTS demo_workspaces (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID,
  demo_type         TEXT DEFAULT 'private_sales',
  template          TEXT,
  business_name     TEXT,
  contact_name      TEXT,
  contact_email     TEXT,
  slug              TEXT,
  status            TEXT DEFAULT 'active',       -- active | disabled | expired | converted
  salesperson       TEXT,
  internal_notes    TEXT,
  external_sending  BOOLEAN DEFAULT false,
  read_only         BOOLEAN DEFAULT true,
  conversion_status TEXT,                        -- null | trial | paid
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ,
  last_reset_at     TIMESTAMPTZ,
  last_login_at     TIMESTAMPTZ,
  session_count     INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_demo_workspaces_created ON demo_workspaces(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_workspaces_company ON demo_workspaces(company_id);
ALTER TABLE demo_workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage demo_workspaces" ON demo_workspaces;
CREATE POLICY "Anyone can manage demo_workspaces" ON demo_workspaces FOR ALL USING (true);

-- Demo usage analytics (sessions, feature clicks, conversion events).
CREATE TABLE IF NOT EXISTS demo_analytics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID,
  demo_workspace_id UUID,
  event             TEXT NOT NULL,
  meta              JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_demo_analytics_created ON demo_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_analytics_company ON demo_analytics(company_id, created_at DESC);
ALTER TABLE demo_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage demo_analytics" ON demo_analytics;
CREATE POLICY "Anyone can manage demo_analytics" ON demo_analytics FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
