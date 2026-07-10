-- ============================================================
-- COLVY V130 — SHOPIFY INTEGRATION (custom app token)
-- Multi-store from the start (a company can connect several
-- Shopify stores). Mirrors the WooCommerce model.
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS shopify_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  store_domain TEXT NOT NULL,             -- e.g. my-store.myshopify.com
  store_name TEXT,
  access_token TEXT,                      -- Admin API access token (server-side only)
  api_version TEXT DEFAULT '2024-10',
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  last_full_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shopify_integrations_company ON shopify_integrations(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS shopify_company_store_uniq ON shopify_integrations(company_id, store_domain);
ALTER TABLE shopify_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage shopify_integrations" ON shopify_integrations;
CREATE POLICY "Anyone can manage shopify_integrations" ON shopify_integrations FOR ALL USING (true);

-- Synced Shopify customers (same shape as woocommerce_customers)
CREATE TABLE IF NOT EXISTS shopify_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  integration_id UUID,
  shopify_customer_id BIGINT,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  address JSONB,
  total_spend NUMERIC DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  last_order_date TIMESTAMPTZ,
  first_order_date TIMESTAMPTZ,
  items_purchased JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shopify_customers_company ON shopify_customers(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS shopify_customer_uniq ON shopify_customers(company_id, shopify_customer_id);
ALTER TABLE shopify_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage shopify_customers" ON shopify_customers;
CREATE POLICY "Anyone can manage shopify_customers" ON shopify_customers FOR ALL USING (true);

-- Background sync jobs for Shopify (mirrors woo_sync_jobs)
CREATE TABLE IF NOT EXISTS shopify_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  integration_id UUID,
  status TEXT DEFAULT 'running',          -- running | done | error
  phase TEXT DEFAULT 'customers',         -- customers | orders
  page_info TEXT,                         -- Shopify cursor pagination token
  customers_synced INTEGER DEFAULT 0,
  orders_synced INTEGER DEFAULT 0,
  message TEXT,
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shopify_jobs_company ON shopify_sync_jobs(company_id);
ALTER TABLE shopify_sync_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage shopify_sync_jobs" ON shopify_sync_jobs;
CREATE POLICY "Anyone can manage shopify_sync_jobs" ON shopify_sync_jobs FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
