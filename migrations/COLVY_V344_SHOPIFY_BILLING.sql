-- ============================================================
-- COLVY V344 — COLVY PLANS BILLED THROUGH SHOPIFY
--
-- Shopify's App Store rules: a merchant using Colvy through the Shopify
-- app pays for Colvy through Shopify (Shopify App Pricing), not Stripe.
--
-- • companies.billing_provider — 'shopify' for a workspace whose plan is
--   billed by Shopify (NULL/'stripe' = Stripe as before), and which
--   store's subscription it follows (billing_integration_id).
-- • shopify_integrations.shop_gid — the store's Shopify id, which the
--   Partner API needs; billing — the last subscription Colvy read
--   (plan, trial end, renewal, cancel at end), and when.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS billing_provider TEXT;           -- NULL | stripe | shopify
ALTER TABLE companies ADD COLUMN IF NOT EXISTS billing_integration_id UUID;     -- shopify_integrations.id
CREATE INDEX IF NOT EXISTS idx_companies_billing_provider ON companies(billing_provider) WHERE billing_provider IS NOT NULL;

ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS shop_gid TEXT;
ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS billing JSONB;
ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS billing_checked_at TIMESTAMPTZ;
