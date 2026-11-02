-- ============================================================
-- COLVY V425 — LOCK THE CONNECTION KEYS
--
-- The keys Colvy uses to act for a business with other services were readable
-- AND writable by every signed-in team member (V300 gave these tables one
-- FOR ALL policy for is_company_member), straight through the public API,
-- whatever the admin screens allow:
--
--   telnyx_integrations       API key, SIP / registration passwords
--   meta_channels             Facebook / Instagram page access token
--   email_channels            Gmail / Outlook access + refresh tokens
--   google_business_accounts  Google Business Profile access + refresh tokens
--   realestate_integrations   realestate.com.au API secret, webhook token
--                             (read-only for members, but the secret showed)
--   saved_cards               customers' saved-card references (no secrets,
--                             but members could add or delete them)
--
-- A team member could copy a key and keep using it outside Colvy (post as the
-- Page, send texts and make calls on the account) even after being removed,
-- or repoint a connection. Same fix as V351 (Twilio, Prexty) and V423
-- (WooCommerce, Shopify):
--
--   • team members (is_company_member: owner and team, not board visitors)
--     and the platform admin may READ the safe columns: is it connected,
--     which number / page / mailbox, labels, signature;
--   • the secret columns are not granted to anyone but the server;
--   • only the server writes (every route and job uses the service role).
--
-- The code that goes with this (PR "Lock connection keys") stops the browser
-- reading any secret or writing these tables:
--   • Channels page: "connected?" for Telnyx / Google comes from
--     /api/channels/connected (yes / no only);
--   • the inbox's From line reads named columns, not *;
--   • the Web form page creates its addresses via /api/web-form/channels.
-- The mobile app already reads only safe columns.
--
-- ORDER: deploy that code first, then run this. Safe to re-run.
--
-- ⚠️ AFTERWARDS (recommended): closing the door doesn't un-copy a key. To make
--    any copy someone already took stop working: reconnect Facebook /
--    Instagram, Google Business Profile and each Gmail / Outlook mailbox, and
--    generate a new Telnyx API key (and SIP password) if Telnyx is used.
-- ============================================================

DO $$
DECLARE
  spec RECORD;
  r RECORD;
  cols TEXT;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('telnyx_integrations',      ARRAY['api_key', 'reg_password', 'sip_conn_password', 'sip_password']),
      ('meta_channels',            ARRAY['page_access_token', 'user_access_token', 'token_expires_at']),
      ('email_channels',           ARRAY['access_token', 'refresh_token', 'token_expires_at', 'smtp_password', 'imap_password']),
      ('google_business_accounts', ARRAY['access_token', 'refresh_token', 'token_expires_at']),
      ('realestate_integrations',  ARRAY['api_secret', 'webhook_token']),
      ('saved_cards',              ARRAY[]::TEXT[])
    ) AS v(tbl, secret_cols)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = spec.tbl) THEN
      RAISE NOTICE 'skipped % (no such table)', spec.tbl;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', spec.tbl);

    -- Every permissive policy, whatever it is called (RESTRICTIVE ones, if any,
    -- are kept, as in V412).
    FOR r IN
      SELECT policyname FROM pg_policies
       WHERE schemaname = 'public' AND tablename = spec.tbl AND permissive = 'PERMISSIVE'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, spec.tbl);
      RAISE NOTICE 'dropped % on %', r.policyname, spec.tbl;
    END LOOP;

    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', spec.tbl);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', spec.tbl);

    -- Every column except the named secrets and anything that looks like one
    -- (a key added later stays hidden until someone grants it on purpose).
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = spec.tbl
       AND column_name <> ALL (spec.secret_cols)
       AND column_name !~* '(secret|token|password|passwd|api_key|apikey|private|signing|credential)';
    IF cols IS NOT NULL THEN
      EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated', cols, spec.tbl);
    END IF;

    EXECUTE format($f$
      CREATE POLICY company_members_read ON public.%I
        FOR SELECT TO authenticated
        USING (is_company_member(company_id) OR is_platform_admin())
    $f$, spec.tbl);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── Verify ──────────────────────────────────────────────────────────────────
-- 1. One policy per table, company_members_read, SELECT only:
SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('telnyx_integrations', 'meta_channels', 'email_channels',
                     'google_business_accounts', 'realestate_integrations', 'saved_cards')
 ORDER BY tablename, policyname;

-- 2. Every row must say false (signed-in users can't read a secret):
SELECT t, c, has_column_privilege('authenticated', 'public.' || t, c, 'SELECT') AS members_can_read
  FROM (VALUES
    ('telnyx_integrations', 'api_key'), ('telnyx_integrations', 'sip_password'),
    ('meta_channels', 'page_access_token'),
    ('email_channels', 'access_token'), ('email_channels', 'refresh_token'),
    ('google_business_accounts', 'access_token'), ('google_business_accounts', 'refresh_token'),
    ('realestate_integrations', 'api_secret')
  ) AS v(t, c)
 WHERE EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = v.t AND column_name = v.c);

-- 3. Every row must say false (signed-in users can't write these tables):
SELECT t,
       has_table_privilege('authenticated', 'public.' || t, 'INSERT') AS can_insert,
       has_table_privilege('authenticated', 'public.' || t, 'UPDATE') AS can_update,
       has_table_privilege('authenticated', 'public.' || t, 'DELETE') AS can_delete
  FROM unnest(ARRAY['telnyx_integrations', 'meta_channels', 'email_channels',
                    'google_business_accounts', 'realestate_integrations', 'saved_cards']) AS t
 WHERE to_regclass('public.' || t) IS NOT NULL;

-- ── Rollback (not recommended: team members could read the keys again) ──────
-- DO $$ DECLARE t TEXT; BEGIN
--   FOREACH t IN ARRAY ARRAY['telnyx_integrations','meta_channels','email_channels',
--                            'google_business_accounts','realestate_integrations','saved_cards'] LOOP
--     IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
--     EXECUTE format('DROP POLICY IF EXISTS company_members_read ON public.%I', t);
--     EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
--     EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated
--                     USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id))',
--                    'company_members_' || t, t);
--   END LOOP;
-- END $$;
