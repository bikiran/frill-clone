-- ============================================================
-- COLVY V222 — COMPANY ENTITLEMENTS OVERRIDES
-- Per-company overrides of plan features and usage limits, set by the super
-- admin without changing the plan. features/limits are JSONB maps keyed by the
-- feature/limit keys in lib/plan.ts; a missing key means "use the plan default".
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS company_entitlements (
  company_id   UUID PRIMARY KEY,
  features     JSONB DEFAULT '{}'::jsonb,   -- { featureKey: true | false }
  limits       JSONB DEFAULT '{}'::jsonb,   -- { limitKey: number }
  reason       TEXT,
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE company_entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage company_entitlements" ON company_entitlements;
CREATE POLICY "Anyone can manage company_entitlements" ON company_entitlements FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
