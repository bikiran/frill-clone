-- ============================================================
-- ROOT CAUSE FIX: site_settings table has "key" as a single-column
-- PRIMARY KEY. This means only ONE row in the ENTIRE table can ever
-- have key = 'general' — so only the very first company that ever
-- saved settings could actually save. Every other company's INSERT
-- silently fails with a primary-key violation (23505), and since
-- auto-save doesn't surface errors to the user, it looks like
-- "settings just don't save."
--
-- Fix: give the table a proper UUID id as primary key, and enforce
-- uniqueness per (key, company_id) pair instead of on key alone.
-- Run this once in the Supabase SQL Editor.
-- ============================================================

-- 1. Add a proper id column if it doesn't exist yet
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

-- Backfill any existing rows that might have a null id
UPDATE site_settings SET id = gen_random_uuid() WHERE id IS NULL;

ALTER TABLE site_settings ALTER COLUMN id SET NOT NULL;

-- 2. Drop the old single-column primary key on "key"
--    (this is what was blocking every company except the first)
ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_pkey;

-- 3. Make id the new primary key
ALTER TABLE site_settings ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);

-- 4. Clean up any duplicate/stale named constraint from earlier migration attempts
ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_unique_key_company CASCADE;

-- 5. Re-create the correct uniqueness rules:
--    - one row per (key, company_id) for company-scoped settings
--    - one row per key for global settings (company_id IS NULL)
DROP INDEX IF EXISTS site_settings_key_company;
DROP INDEX IF EXISTS site_settings_key_global;
DROP INDEX IF EXISTS site_settings_unique_key_company;
DROP INDEX IF EXISTS site_settings_unique_key_global;

CREATE UNIQUE INDEX IF NOT EXISTS site_settings_unique_key_company
  ON site_settings(key, company_id) WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS site_settings_unique_key_global
  ON site_settings(key) WHERE company_id IS NULL;

-- 6. Sanity check: this should now show one row per company that has saved settings
-- SELECT id, key, company_id, updated_at FROM site_settings ORDER BY updated_at DESC;
