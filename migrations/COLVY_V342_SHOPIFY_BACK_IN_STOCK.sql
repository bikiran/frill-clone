-- ============================================================
-- COLVY V342 — SHOPIFY BACK IN STOCK + STOREFRONT
--
-- Back-in-stock waitlists for Shopify products. Shoppers join from the
-- "Notify me" block on a sold-out product (the Colvy theme app extension,
-- through Shopify's signed app proxy); staff can add them from the inbox or
-- Waitlists page. When Shopify reports the size/variant back in stock, everyone
-- waiting gets one SMS (or email), exactly like WooCommerce.
--
-- Shopify entries keep both ids: the variant they asked for (null = any
-- option) and its product, so a restock is matched without scanning.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE stock_waitlist ADD COLUMN IF NOT EXISTS shopify_product_id BIGINT;
ALTER TABLE stock_waitlist ADD COLUMN IF NOT EXISTS shopify_variant_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_waitlist_company_shopify_product ON stock_waitlist(company_id, shopify_product_id) WHERE shopify_product_id IS NOT NULL;

-- One open entry per customer per item — now with Shopify items in the key
-- (a variant, else "any option" of a product), so two sizes of one Shopify
-- product are two items and adding someone twice is still a no-op.
DROP INDEX IF EXISTS uniq_waitlist_open_entry;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_waitlist_open_entry ON stock_waitlist (
  company_id,
  COALESCE(contact_id::text, phone, email),
  COALESCE(
    woo_product_id::text,
    'shopify:' || COALESCE(shopify_variant_id::text, 'p' || shopify_product_id::text),
    lower(item_name)
  )
) WHERE status IN ('waiting', 'queued');

-- What Colvy last wrote to the store's app metafields (workspace slug, brand
-- colour) for the theme extension to read; rewritten only when it changes.
ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS app_metafields JSONB;

NOTIFY pgrst, 'reload schema';
