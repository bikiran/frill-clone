-- ============================================================
-- COLVY V339 — SHOPIFY APP (OAuth install, expiring tokens,
-- webhooks, customers → contacts) + lock down Shopify data
--
-- Since 1 Jan 2026 a merchant can no longer create a "custom app" in
-- their Shopify admin and paste its token. Stores now connect by
-- installing the Colvy Shopify app (OAuth). New apps get EXPIRING
-- offline tokens: a 1-hour access token plus a 90-day refresh token
-- that rotates on every refresh — so both, and their expiry, are kept.
--
-- Stores connected the old way (a pasted shpat_ token from a custom
-- app made before 2026) keep working: auth_type = 'token'.
--
-- ALSO A FIX: shopify_customers and shopify_sync_jobs still had V130's
-- "Anyone can manage … USING (true)" policy, i.e. any holder of the
-- public anon key could read synced customers' names, emails and phone
-- numbers. Both are now scoped to company members, like every other
-- table that holds customer data.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- ── Store connections ───────────────────────────────────────────────────────
ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS auth_type TEXT DEFAULT 'token';   -- oauth | token
ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS refresh_token TEXT;
ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;      -- access token
ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS refresh_expires_at TIMESTAMPTZ;    -- refresh token
ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS scopes TEXT;
ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS needs_reauth BOOLEAN DEFAULT false;
ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS webhooks_registered_at TIMESTAMPTZ;
ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS uninstalled_at TIMESTAMPTZ;
ALTER TABLE shopify_integrations ADD COLUMN IF NOT EXISTS installed_by UUID;
CREATE INDEX IF NOT EXISTS idx_shopify_integrations_domain ON shopify_integrations(store_domain);

-- One-time OAuth states. A row is written when someone in a workspace
-- clicks "Install on Shopify" and consumed (used_at) by the callback,
-- so a state can't be replayed and always maps back to the workspace
-- and person that started it. Service role only — no policies.
CREATE TABLE IF NOT EXISTS shopify_oauth_states (
  nonce TEXT PRIMARY KEY,
  company_id UUID NOT NULL,
  user_id UUID,
  shop TEXT NOT NULL,
  return_to TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE shopify_oauth_states ENABLE ROW LEVEL SECURITY;

-- ── Customers ───────────────────────────────────────────────────────────────
ALTER TABLE shopify_customers ADD COLUMN IF NOT EXISTS contact_id UUID;
ALTER TABLE shopify_customers ADD COLUMN IF NOT EXISTS phone_norm TEXT;
ALTER TABLE shopify_customers ADD COLUMN IF NOT EXISTS email_marketing TEXT;   -- Shopify marketingState
ALTER TABLE shopify_customers ADD COLUMN IF NOT EXISTS sms_marketing TEXT;
ALTER TABLE shopify_customers ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE shopify_customers ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE shopify_customers ADD COLUMN IF NOT EXISTS shopify_created_at TIMESTAMPTZ;
ALTER TABLE shopify_customers ADD COLUMN IF NOT EXISTS shopify_updated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_shopify_customers_contact ON shopify_customers(contact_id);

-- Where a resumable sync got to (Shopify GraphQL cursor) already lives
-- in shopify_sync_jobs.page_info; record what kind of run it was.
ALTER TABLE shopify_sync_jobs ADD COLUMN IF NOT EXISTS contacts_linked INTEGER DEFAULT 0;
ALTER TABLE shopify_sync_jobs ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

-- ── Lock down the Shopify data tables ───────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  r RECORD;
BEGIN
  -- shopify_integrations was already locked by V300; re-asserting it is a
  -- no-op there and closes the token columns if V300 was ever skipped.
  FOREACH t IN ARRAY ARRAY['shopify_customers', 'shopify_sync_jobs', 'shopify_integrations'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR r IN
      SELECT policyname FROM pg_policies
       WHERE schemaname = 'public' AND tablename = t
         AND policyname <> 'company_members_' || t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'company_members_' || t, t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR ALL TO authenticated
        USING (is_company_member(company_id))
        WITH CHECK (is_company_member(company_id))
    $f$, 'company_members_' || t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Confirm: one company_members_ policy each, no `true` quals.
SELECT tablename, policyname, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('shopify_customers', 'shopify_sync_jobs', 'shopify_integrations', 'shopify_oauth_states')
 ORDER BY tablename, policyname;
