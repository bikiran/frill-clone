-- ============================================================
-- COLVY V356 — LOCK chat_payments (PAY LINKS) TO THE BUSINESS'S OWN TEAM
--
-- chat_payments still had the original policy from V119/V155:
--
--   CREATE POLICY "Anyone can manage chat_payments" ... FOR ALL USING (true)
--
-- with no TO clause, so anyone holding the public key (it ships in the web
-- page and the mobile app) could read every business's pay links — customer
-- names, emails, phone numbers, addresses, amounts — and could edit them.
--
-- After this:
--   • signed-in members of the business can read and manage their own pay
--     links (the Payments page and the mobile app keep working unchanged);
--   • the public key gets nothing;
--   • every server route already uses the service role, which isn't affected.
--
-- The credential tables (telnyx_integrations, email_channels, meta_channels,
-- shopify_integrations, google_business_accounts, woocommerce_integrations)
-- were already scoped to company members by V209/V300; this also removes the
-- public key's leftover table privileges on them.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

DO $$
DECLARE r RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_payments') THEN
    RAISE NOTICE 'chat_payments does not exist — skipped';
    RETURN;
  END IF;

  ALTER TABLE public.chat_payments ENABLE ROW LEVEL SECURITY;

  -- Drop every existing policy, whatever it's called, then add exactly one.
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_payments' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.chat_payments', r.policyname);
  END LOOP;

  REVOKE ALL ON public.chat_payments FROM anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_payments TO authenticated;
  GRANT ALL ON public.chat_payments TO service_role;

  CREATE POLICY company_members_chat_payments ON public.chat_payments
    FOR ALL TO authenticated
    USING (is_company_member(company_id))
    WITH CHECK (is_company_member(company_id));
END $$;

-- Belt and braces for the credential tables V209/V300 scoped to members: their
-- policies already return nothing to the public key, but the key still held
-- table privileges. No public page reads them (V209), so take those away too.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['telnyx_integrations', 'email_channels', 'meta_channels',
                           'shopify_integrations', 'google_business_accounts', 'woocommerce_integrations'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── Check ───────────────────────────────────────────────────────────────────
-- Expect one row per table: rls_on = true, anon_can_select = false, and no
-- policy that lets everyone in (open_policies = 0).
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_on,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_select,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname
           AND (p.qual = 'true' OR 'public' = ANY (p.roles) OR 'anon' = ANY (p.roles))) AS open_policies
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
 WHERE c.relname IN ('chat_payments', 'telnyx_integrations', 'email_channels', 'meta_channels',
                     'shopify_integrations', 'google_business_accounts', 'woocommerce_integrations')
 ORDER BY c.relname;
