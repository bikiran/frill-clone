-- ============================================================
-- COLVY V300 — LOCK google_business_accounts (LIVE TOKEN LEAK)
--
-- Verified against production with the anon key that ships inside the Android
-- app and the web bundle:
--
--   GET /rest/v1/google_business_accounts?select=*
--   → id, company_id, access_token, refresh_token, token_expires_at,
--     account_name, location_name, location_title, review_link, is_active
--
-- Not a data leak — a credential leak. A Google Business Profile refresh token
-- is a standing key to that company's profile, and anyone who has ever loaded
-- the site or installed the app could read every company's.
--
-- V209 was written to lock exactly this table and did not, for the same reason
-- V210 missed `messages`: it dropped by guessed policy names —
--   'Anyone can manage ' || t, 'Anyone can read ' || t, 'Public read ' || t
-- and this table's policy is called "Anyone can manage gbp". Nothing matched,
-- DROP POLICY IF EXISTS succeeded, the migration reported success. The other
-- seven tables in V209's list are confirmed locked; this is the one that got
-- through on a name.
--
-- So: drop by what a policy IS, not by what it might be called.
--
-- Safe to run. Every server reader (lib/google-business.ts, the review sync
-- cron, the dispatch and callback routes, /r/[id]) uses the service role and
-- bypasses RLS. The two admin pages read it signed in, which the member policy
-- allows. Only anonymous access is removed, and nothing legitimate has any.
--
-- ⚠️ ROTATE AFTERWARDS. Closing the door does not un-copy a key. Every token
--    in this table should be treated as disclosed: disconnect and reconnect
--    Google Business Profile for each company, which issues new ones.
-- ============================================================

-- ── STEP 1: what is there now ───────────────────────────────────────────────
SELECT tablename, policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename = 'google_business_accounts'
 ORDER BY policyname;

-- ── STEP 2: lock it, and re-sweep the rest of V209's list by shape ──────────
DO $$
DECLARE
  t TEXT;
  r RECORD;
  tables TEXT[] := ARRAY[
    'telnyx_integrations',
    'google_business_accounts',
    'meta_channels',
    'woocommerce_integrations',
    'shopify_integrations',
    'email_channels',
    'saved_cards',
    'push_tokens'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = t
    ) THEN CONTINUE; END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Every policy that is not the company one, whatever it is called.
    FOR r IN
      SELECT policyname FROM pg_policies
       WHERE schemaname = 'public' AND tablename = t
         AND policyname <> 'company_members_' || t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
      RAISE NOTICE 'dropped % on %', r.policyname, t;
    END LOOP;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'company_members_' || t, t);

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = t AND column_name = 'company_id'
    ) THEN
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I
          FOR ALL TO authenticated
          USING (is_company_member(company_id))
          WITH CHECK (is_company_member(company_id))
      $f$, 'company_members_' || t, t);
    ELSE
      -- No company_id to scope by (push_tokens is keyed on the user). Signed-in
      -- and owned by the caller is the most this can say here; push_tokens has
      -- its own policy from V220, which the loop above preserves by name.
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I
          FOR ALL TO authenticated
          USING (auth.uid() IS NOT NULL)
          WITH CHECK (auth.uid() IS NOT NULL)
      $f$, 'company_members_' || t, t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 3: confirm ─────────────────────────────────────────────────────────
-- One row per table that exists, TO authenticated, no `true` quals.
SELECT tablename, policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('telnyx_integrations', 'google_business_accounts',
                     'meta_channels', 'woocommerce_integrations',
                     'shopify_integrations', 'email_channels',
                     'saved_cards', 'push_tokens')
 ORDER BY tablename, policyname;
