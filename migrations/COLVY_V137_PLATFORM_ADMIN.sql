-- ============================================================
-- COLVY V137 — PLATFORM ADMIN: COMPANY MANAGEMENT FIELDS
-- Fields the super-admin can set per company from admin.colvy.com.
-- Safe to re-run.
-- ============================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_phone TEXT;      -- contact phone shown/used for the company
ALTER TABLE companies ADD COLUMN IF NOT EXISTS assigned_admin_email TEXT; -- staff member responsible (informational)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS notes TEXT;                -- internal super-admin notes

NOTIFY pgrst, 'reload schema';
