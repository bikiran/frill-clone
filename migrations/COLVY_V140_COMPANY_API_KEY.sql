-- ============================================================
-- COLVY V140 — COMPANY API KEY (for WordPress plugin dashboard)
-- Lets the WordPress plugin authenticate as the company to read/write
-- a safe subset of settings (name, logo, favicon, homepage) without
-- exposing the service role.
-- Safe to re-run.
-- ============================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS api_key TEXT;

-- Give every existing company a key if they don't have one.
UPDATE companies SET api_key = 'colvy_' || replace(gen_random_uuid()::text, '-', '') WHERE api_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_companies_api_key ON companies(api_key);

NOTIFY pgrst, 'reload schema';
