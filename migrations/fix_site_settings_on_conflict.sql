-- ============================================================
-- Fix "no unique or exclusion constraint matching ON CONFLICT"
--
-- The previous fix created a PARTIAL unique index:
--   CREATE UNIQUE INDEX ... ON site_settings(key, company_id)
--     WHERE company_id IS NOT NULL
--
-- Postgres will NOT use a partial index for ON CONFLICT (key, company_id)
-- inference unless the same WHERE clause is included in the upsert query
-- itself — which Supabase's `.upsert(..., { onConflict: 'key,company_id' })`
-- does not support. We need a plain, non-partial UNIQUE CONSTRAINT instead.
--
-- Note: a standard UNIQUE constraint still allows multiple rows where
-- company_id IS NULL (Postgres treats NULLs as distinct by default),
-- so global/legacy settings rows are unaffected.
-- ============================================================

-- Drop the partial indexes from the previous migration
DROP INDEX IF EXISTS site_settings_unique_key_company;
DROP INDEX IF EXISTS site_settings_unique_key_global;
DROP INDEX IF EXISTS site_settings_key_company;
DROP INDEX IF EXISTS site_settings_key_global;

-- Drop the constraint if a previous attempt already made one
ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_key_company_unique;

-- Create the real unique constraint that ON CONFLICT can use
ALTER TABLE site_settings
  ADD CONSTRAINT site_settings_key_company_unique UNIQUE (key, company_id);

-- Verify
SELECT id, key, company_id, updated_at FROM site_settings ORDER BY updated_at DESC;
