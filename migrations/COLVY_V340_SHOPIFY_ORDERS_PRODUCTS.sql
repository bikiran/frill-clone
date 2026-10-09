-- ============================================================
-- COLVY V340 — SHOPIFY ORDERS + PRODUCTS
--
-- Shopify orders go straight into the operational `orders` /
-- `order_items` tables (sales_channel = 'shopify'), so the Orders board,
-- reports, dashboard and the AI/MCP order tools see them with no extra
-- code. Shopify products get their own catalogue table, the twin of
-- woocommerce_products, for the composer's product search, the AI and
-- (next phase) back-in-stock.
--
-- Also:
--  • orders.customer_phone_norm (+ an email index): the inbox matches a
--    conversation to orders by email OR phone; orders had neither index.
--  • orders.metadata: the Orders board already writes ship weight/parcel
--    into it, but no migration ever created the column.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Product catalogue ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shopify_products (
  company_id UUID NOT NULL,
  integration_id UUID,
  shopify_product_id BIGINT NOT NULL,
  handle TEXT,
  name TEXT NOT NULL DEFAULT '',
  status TEXT,                         -- ACTIVE | DRAFT | ARCHIVED
  product_type TEXT,
  vendor TEXT,
  tags TEXT[],
  sku TEXT NOT NULL DEFAULT '',        -- first variant's SKU
  skus TEXT NOT NULL DEFAULT '',       -- every variant SKU, space-separated (search)
  price NUMERIC,                       -- lowest variant price
  max_price NUMERIC,
  compare_at_price NUMERIC,            -- of the lowest-priced variant, if on sale
  currency TEXT,
  stock_status TEXT,                   -- instock | outofstock (WooCommerce words, so shared UI just works)
  stock_quantity INTEGER,
  tracks_inventory BOOLEAN,
  image TEXT,
  permalink TEXT,                      -- online store URL; null when not published
  has_variations BOOLEAN DEFAULT false,
  variants JSONB DEFAULT '[]'::jsonb,  -- [{id,title,sku,price,compare_at_price,inventory_quantity,available,options,inventory_item_id}]
  inventory_item_ids BIGINT[] DEFAULT '{}',
  shopify_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (company_id, shopify_product_id)
);
CREATE INDEX IF NOT EXISTS idx_shopify_products_company ON shopify_products(company_id);
CREATE INDEX IF NOT EXISTS idx_shopify_products_integration ON shopify_products(integration_id);
CREATE INDEX IF NOT EXISTS idx_shopify_products_name_trgm ON shopify_products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_shopify_products_skus_trgm ON shopify_products USING gin (skus gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_shopify_products_inventory ON shopify_products USING gin (inventory_item_ids);
-- Service role only, like woocommerce_products: reads go through the API.
ALTER TABLE shopify_products ENABLE ROW LEVEL SECURITY;

-- ── Orders: matching + the missing metadata column ─────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone_norm TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
UPDATE orders
   SET customer_phone_norm = RIGHT(REGEXP_REPLACE(customer_phone, '\D', '', 'g'), 9)
 WHERE customer_phone IS NOT NULL
   AND customer_phone_norm IS NULL
   AND LENGTH(REGEXP_REPLACE(customer_phone, '\D', '', 'g')) >= 8;
CREATE INDEX IF NOT EXISTS idx_orders_company_phone_norm ON orders(company_id, customer_phone_norm);
CREATE INDEX IF NOT EXISTS idx_orders_company_email ON orders(company_id, customer_email);

-- ── Sync progress ───────────────────────────────────────────────────────────
ALTER TABLE shopify_sync_jobs ADD COLUMN IF NOT EXISTS products_synced INTEGER DEFAULT 0;
ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS orders_synced_at TIMESTAMPTZ;
ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS products_synced_at TIMESTAMPTZ;
ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS webhook_topics TEXT[];

NOTIFY pgrst, 'reload schema';
