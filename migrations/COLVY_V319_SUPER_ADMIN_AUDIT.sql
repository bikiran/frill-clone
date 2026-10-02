-- COLVY_V319_SUPER_ADMIN_AUDIT
-- An audit trail of platform super-admin actions (plan changes, credits, trial
-- extensions, suspensions, impersonation). Every privileged action writes one
-- row so there's a who/what/when record per company. Idempotent.

CREATE TABLE IF NOT EXISTS super_admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  admin_id UUID,
  admin_email TEXT,
  company_id UUID,
  action TEXT NOT NULL,        -- e.g. 'plan_change' | 'credit_grant' | 'trial_extend' | 'suspend' | 'reactivate' | 'impersonate_start' | 'impersonate_end' | 'company_update'
  summary TEXT,                -- human-readable one-liner
  detail JSONB                 -- structured before/after or params
);

CREATE INDEX IF NOT EXISTS idx_sa_audit_company ON super_admin_audit(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sa_audit_created ON super_admin_audit(created_at DESC);

ALTER TABLE super_admin_audit ENABLE ROW LEVEL SECURITY;
-- Written and read only via the service-role key from super-admin-gated routes.
DROP POLICY IF EXISTS "service role manages super_admin_audit" ON super_admin_audit;
CREATE POLICY "service role manages super_admin_audit" ON super_admin_audit FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
