-- ============================================================
-- COLVY V129 — MULTIPLE WOOCOMMERCE STORES PER COMPANY  (defensive)
-- Removes the one-store-per-company limit and adds a store name.
-- Fully guarded: checks the table + columns exist before touching them,
-- so it won't error with "column company_id does not exist".
-- Safe to re-run.
-- ============================================================

DO $$
DECLARE
  has_table   BOOLEAN;
  has_company BOOLEAN;
  has_store   BOOLEAN;
BEGIN
  -- Does the table exist at all?
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'woocommerce_integrations'
  ) INTO has_table;

  IF NOT has_table THEN
    RAISE NOTICE 'woocommerce_integrations does not exist yet - creating it fresh.';
    CREATE TABLE woocommerce_integrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      store_url TEXT,
      consumer_key TEXT,
      consumer_secret TEXT,
      is_active BOOLEAN DEFAULT true,
      last_synced_at TIMESTAMPTZ,
      last_full_sync_at TIMESTAMPTZ,
      sync_frequency_minutes INTEGER DEFAULT 60,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE woocommerce_integrations ENABLE ROW LEVEL SECURITY;
    BEGIN
      CREATE POLICY "Anyone can manage woocommerce_integrations" ON woocommerce_integrations FOR ALL USING (true);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;

  -- Ensure the columns we rely on exist (covers oddly-shaped legacy tables).
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='woocommerce_integrations' AND column_name='company_id') INTO has_company;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='woocommerce_integrations' AND column_name='store_url') INTO has_store;

  IF NOT has_company THEN
    ALTER TABLE woocommerce_integrations ADD COLUMN company_id UUID;
  END IF;
  IF NOT has_store THEN
    ALTER TABLE woocommerce_integrations ADD COLUMN store_url TEXT;
  END IF;

  -- New columns for multi-store
  ALTER TABLE woocommerce_integrations ADD COLUMN IF NOT EXISTS store_name TEXT;
  ALTER TABLE woocommerce_integrations ADD COLUMN IF NOT EXISTS store_slug TEXT;
  ALTER TABLE woocommerce_integrations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

  -- Drop any unique constraint / index on company_id so a company can have
  -- several stores. Names vary by how the table was created; ignore misses.
  BEGIN EXECUTE 'ALTER TABLE woocommerce_integrations DROP CONSTRAINT IF EXISTS woocommerce_integrations_company_id_key'; EXCEPTION WHEN others THEN NULL; END;
  BEGIN EXECUTE 'DROP INDEX IF EXISTS woocommerce_company_uniq'; EXCEPTION WHEN others THEN NULL; END;
  BEGIN EXECUTE 'DROP INDEX IF EXISTS woocommerce_integrations_company_id_idx'; EXCEPTION WHEN others THEN NULL; END;

  -- Fast per-company lookups
  CREATE INDEX IF NOT EXISTS idx_woo_integrations_company ON woocommerce_integrations(company_id);

  -- Unique per (company_id, store_url): same store can't be added twice, but
  -- different stores are fine. Upserts key on this.
  CREATE UNIQUE INDEX IF NOT EXISTS woo_company_store_uniq ON woocommerce_integrations(company_id, store_url);
END $$;

-- Sync jobs can target a specific store (guarded - table may not exist yet).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='woo_sync_jobs') THEN
    ALTER TABLE woo_sync_jobs ADD COLUMN IF NOT EXISTS integration_id UUID;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
