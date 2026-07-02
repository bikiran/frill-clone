-- ============================================================
-- Fix site_settings primary key bug (verified/idempotent version)
-- Run this WHOLE block at once in Supabase SQL Editor
-- (don't run just the SELECT at the bottom on its own)
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE 'Starting site_settings fix...';

  -- 1. Add id column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_settings' AND column_name = 'id'
  ) THEN
    ALTER TABLE site_settings ADD COLUMN id UUID DEFAULT gen_random_uuid();
    RAISE NOTICE 'Added id column';
  ELSE
    RAISE NOTICE 'id column already exists';
  END IF;

  -- 2. Backfill any nulls
  UPDATE site_settings SET id = gen_random_uuid() WHERE id IS NULL;

  -- 3. Make id NOT NULL
  ALTER TABLE site_settings ALTER COLUMN id SET NOT NULL;

  -- 4. Drop old primary key on "key" (whatever it's actually named)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'site_settings'::regclass AND contype = 'p'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE site_settings DROP CONSTRAINT ' || quote_ident(conname)
      FROM pg_constraint
      WHERE conrelid = 'site_settings'::regclass AND contype = 'p'
      LIMIT 1
    );
    RAISE NOTICE 'Dropped old primary key';
  ELSE
    RAISE NOTICE 'No existing primary key found';
  END IF;

  -- 5. Add new primary key on id (only if none exists now)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'site_settings'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE site_settings ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);
    RAISE NOTICE 'Added new primary key on id';
  END IF;

  RAISE NOTICE 'Primary key fix complete';
END $$;

-- 6. Clean up old constraints/indexes and recreate correct uniqueness
ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_unique_key_company CASCADE;
DROP INDEX IF EXISTS site_settings_key_company;
DROP INDEX IF EXISTS site_settings_key_global;
DROP INDEX IF EXISTS site_settings_unique_key_company;
DROP INDEX IF EXISTS site_settings_unique_key_global;

CREATE UNIQUE INDEX IF NOT EXISTS site_settings_unique_key_company
  ON site_settings(key, company_id) WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS site_settings_unique_key_global
  ON site_settings(key) WHERE company_id IS NULL;

-- 7. Verify — run this separately after, once the block above succeeds
SELECT id, key, company_id, updated_at FROM site_settings ORDER BY updated_at DESC;
