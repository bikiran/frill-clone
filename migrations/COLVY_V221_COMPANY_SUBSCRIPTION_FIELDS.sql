-- ============================================================
-- COLVY V221 — COMPANY SUBSCRIPTION FIELDS
-- Adds the fields the Super Admin console needs to manage a business's
-- subscription directly: an explicit trial end date, a complimentary (comped)
-- flag with a reason, and a timestamp for the last plan change. All optional and
-- additive. Safe to re-run.
-- ============================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_ends_at        TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_complimentary     BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS complimentary_reason TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan_changed_at      TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
