-- ============================================================
-- COLVY V145 — VERIFIED WEBSITE DOMAINS (for Stripe return URLs)
-- The business website(s) where the chat widget is embedded. Used to
-- set Stripe Checkout success/cancel URLs back to the real business
-- site instead of the Colvy tenant subdomain. Safe to re-run.
-- ============================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS website_domains TEXT[] DEFAULT '{}';

-- Seed Roxy Aquarium's domain as an example (no-op if the row/slug differs).
UPDATE companies SET website_domains = ARRAY['roxyaquarium.com.au']
WHERE slug = 'roxyaquarium' AND (website_domains IS NULL OR array_length(website_domains, 1) IS NULL);

NOTIFY pgrst, 'reload schema';
