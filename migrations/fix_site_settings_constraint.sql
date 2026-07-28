-- Ensure site_settings table has proper unique constraint
-- Run this in Supabase SQL Editor if you get constraint errors

-- Drop old constraint if it exists
ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_unique_key_company CASCADE;

-- Create proper unique constraint for (key, company_id) pairs
-- This allows multiple records with same key but different company_id
CREATE UNIQUE INDEX IF NOT EXISTS site_settings_unique_key_company 
  ON site_settings(key, company_id) WHERE company_id IS NOT NULL;

-- Also create index for global settings (where company_id is NULL)
CREATE UNIQUE INDEX IF NOT EXISTS site_settings_unique_key_global 
  ON site_settings(key) WHERE company_id IS NULL;

-- Verify the table structure
-- SELECT * FROM site_settings LIMIT 1;
