-- ============================================================
-- COLVY V422 — SHOPIFY PRIVATE APP
--
-- A second, privately shared Shopify app (custom distribution) can sit
-- next to the public Colvy app, so a store can be connected while the
-- public app is in App Store review (lib/shopify-auth.ts).
--
-- app_client_id is the client ID of the app a store's tokens belong to:
-- NULL for the public app (every store so far), the private app's client
-- ID otherwise. Token refreshes use that app's secret, and stores on the
-- private app are never billed through Shopify (custom apps can't be).
--
-- Run in the Supabase SQL editor. Safe to re-run. Until it has run, the
-- public app keeps working; the private app needs it.
-- ============================================================

ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS app_client_id TEXT;
ALTER TABLE shopify_pending_installs ADD COLUMN IF NOT EXISTS app_client_id TEXT;
ALTER TABLE shopify_oauth_states ADD COLUMN IF NOT EXISTS app_client_id TEXT;

NOTIFY pgrst, 'reload schema';
