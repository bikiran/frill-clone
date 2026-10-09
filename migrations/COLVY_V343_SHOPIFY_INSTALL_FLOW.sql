-- ============================================================
-- COLVY V343 — SHOPIFY INSTALL FLOW (App Store rules)
--
-- Shopify's App Store review requires that an install starts in Shopify
-- (never by typing a myshopify.com address into Colvy) and that
-- Shopify's permission screen comes before anything else. So a store
-- can now be approved in Shopify before Colvy knows which workspace it
-- belongs to:
--
-- • shopify_oauth_states rows may have no workspace yet (an install
--   that started in Shopify) or no store yet (kind = 'intent': someone
--   clicked "Install from Shopify" in their workspace; the store is
--   picked in Shopify).
-- • shopify_pending_installs holds an approved store's tokens for up to
--   an hour until the person who installed it signs in to Colvy and
--   connects it to their workspace. Only a hash of the claim token is
--   stored; the token itself is in an httpOnly cookie on that browser.
--
-- Service role only — RLS on, no policies. Run in the Supabase SQL
-- editor. Safe to re-run.
-- ============================================================

ALTER TABLE shopify_oauth_states ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE shopify_oauth_states ALTER COLUMN shop DROP NOT NULL;
ALTER TABLE shopify_oauth_states ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'oauth';  -- oauth | intent

CREATE TABLE IF NOT EXISTS shopify_pending_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_hash TEXT NOT NULL UNIQUE,
  shop TEXT NOT NULL,
  store_name TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  refresh_expires_at TIMESTAMPTZ,
  scopes TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shopify_pending_installs_shop ON shopify_pending_installs(shop);
CREATE INDEX IF NOT EXISTS idx_shopify_pending_installs_expires ON shopify_pending_installs(expires_at);
ALTER TABLE shopify_pending_installs ENABLE ROW LEVEL SECURITY;
