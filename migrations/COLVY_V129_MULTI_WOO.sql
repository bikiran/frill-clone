-- ============================================================
-- COLVY V129 — MULTIPLE WOOCOMMERCE STORES PER COMPANY
-- Removes the one-store-per-company limit and adds a store name.
-- Run STEP BY STEP (the unique-index drop touches a live table).
-- Safe to re-run.
-- ============================================================

-- STEP 1 — add columns
ALTER TABLE woocommerce_integrations ADD COLUMN IF NOT EXISTS store_name TEXT;
ALTER TABLE woocommerce_integrations ADD COLUMN IF NOT EXISTS store_slug TEXT;

-- STEP 2 — drop any unique constraint / index on company_id so a company can
-- have several stores. The constraint name varies by how the table was created;
-- try the common ones. Ignore "does not exist" errors.
DO $$
BEGIN
  BEGIN EXECUTE 'ALTER TABLE woocommerce_integrations DROP CONSTRAINT IF EXISTS woocommerce_integrations_company_id_key'; EXCEPTION WHEN others THEN NULL; END;
  BEGIN EXECUTE 'DROP INDEX IF EXISTS woocommerce_company_uniq'; EXCEPTION WHEN others THEN NULL; END;
  BEGIN EXECUTE 'DROP INDEX IF EXISTS woocommerce_integrations_company_id_idx'; EXCEPTION WHEN others THEN NULL; END;
END $$;

-- STEP 3 — a non-unique index for fast per-company lookups
CREATE INDEX IF NOT EXISTS idx_woo_integrations_company ON woocommerce_integrations(company_id);

-- STEP 4 — a unique index on (company_id, store_url) so the SAME store can't be
-- added twice, but different stores are fine. Upserts now key on this.
CREATE UNIQUE INDEX IF NOT EXISTS woo_company_store_uniq ON woocommerce_integrations(company_id, store_url);

-- STEP 5 — sync jobs can target a specific store
ALTER TABLE woo_sync_jobs ADD COLUMN IF NOT EXISTS integration_id UUID;

NOTIFY pgrst, 'reload schema';
