-- ============================================================
-- COLVY V351 — LOCK DOWN TABLES THE PUBLIC KEY COULD STILL REACH
--
-- Phase 0 of the Agent Engine work: before AI agents write anything, every
-- log, audit and credential table must be closed to the public key (which
-- ships in the web bundle and the mobile app). Going by the migrations, these
-- were still open:
--
--   ai_actions, ai_assistant_events   FOR ALL USING (true), no TO clause
--   super_admin_audit                 FOR ALL USING (true) — forgeable audit
--   job_runs, api_logs, webhook_events FOR ALL USING (true)
--   prexty_integrations               FOR ALL USING (true) — holds api_key
--   twilio_integrations               RLS never enabled — holds auth_token,
--                                     api_key_secret
--   companies.stripe_secret_key       companies has RLS off, so a business's
--                                     own Stripe secret key was readable
--
-- Like V299/V300 this never guesses policy names: it drops EVERY policy on the
-- tables it touches, then creates exactly the ones wanted.
--
-- After this:
--   • ai_actions, ai_assistant_events, super_admin_audit — server only (all
--     writers and readers use the service role).
--   • job_runs, api_logs, webhook_events — read by the platform admin only
--     (the /platform-admin page reads them signed in); written by the server.
--   • twilio_integrations, prexty_integrations — team members can read the
--     non-secret columns (connected? which number?); secrets are server only.
--   • Stripe secret keys live in company_secrets (server only). A trigger
--     moves any key written to companies.stripe_secret_key straight into it,
--     so the Stripe settings page keeps working unchanged.
--
-- ORDER: deploy the code (PR "Phase 0: lock down exposed data") BEFORE running
-- this — the new code reads company_secrets and falls back to the old column.
--
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- ⚠️ AFTERWARDS: closing a door doesn't un-copy a key. If these tables were
-- open in production, rotate the Twilio auth token / API key secret, the
-- Prexty API key and any business-owned Stripe secret key.
-- ============================================================

-- The platform super admin (matches SUPER_ADMIN in lib/company-access.ts).
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT lower(COALESCE(auth.jwt() ->> 'email', '')) = 'bishalstha76@gmail.com'
$$;
REVOKE ALL ON FUNCTION is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated, service_role;

-- Drops every policy on a table and switches RLS on.
CREATE OR REPLACE FUNCTION pg_temp.colvy_reset_policies(t TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE r RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
    RAISE NOTICE '% does not exist — skipped', t;
    RETURN false;
  END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
  END LOOP;
  RETURN true;
END $$;

-- ── 1. Server only ──────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_actions', 'ai_assistant_events', 'super_admin_audit'] LOOP
    IF pg_temp.colvy_reset_policies(t) THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- ── 2. Platform admin reads, server writes ──────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['job_runs', 'api_logs', 'webhook_events'] LOOP
    IF pg_temp.colvy_reset_policies(t) THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
      EXECUTE format($f$
        CREATE POLICY platform_admin_read ON public.%I
          FOR SELECT TO authenticated
          USING (is_platform_admin())
      $f$, t);
    END IF;
  END LOOP;
END $$;

-- ── 3. Credentials: members see the safe columns, secrets stay server-side ──
-- Column privileges: authenticated may SELECT every column EXCEPT the secrets
-- (so the integrations pages can still ask "is Twilio connected, which
-- number?"). Nothing in the browser writes these tables.
DO $$
DECLARE
  spec RECORD;
  cols TEXT;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('twilio_integrations', ARRAY['auth_token', 'api_key_secret', 'api_key_sid', 'stripe_subscription_id']),
      ('prexty_integrations', ARRAY['api_key', 'webhook_token', 'webhook_secret'])
    ) AS v(tbl, secret_cols)
  LOOP
    IF NOT pg_temp.colvy_reset_policies(spec.tbl) THEN CONTINUE; END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', spec.tbl);

    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = spec.tbl
       AND column_name <> ALL (spec.secret_cols);
    IF cols IS NOT NULL THEN
      EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated', cols, spec.tbl);
    END IF;

    EXECUTE format($f$
      CREATE POLICY company_members_read ON public.%I
        FOR SELECT TO authenticated
        USING (is_company_member(company_id))
    $f$, spec.tbl);
  END LOOP;
END $$;

-- ── 4. Stripe secret keys → company_secrets ─────────────────────────────────
CREATE TABLE IF NOT EXISTS company_secrets (
  company_id        UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  stripe_secret_key TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE company_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON company_secrets FROM anon, authenticated;
GRANT ALL ON company_secrets TO service_role;

-- Any key written to companies.stripe_secret_key (the Stripe settings page
-- still does this) is moved into company_secrets and never stored on the row.
CREATE OR REPLACE FUNCTION companies_move_stripe_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stripe_secret_key IS NOT NULL AND btrim(NEW.stripe_secret_key) <> '' THEN
    INSERT INTO company_secrets (company_id, stripe_secret_key, updated_at)
    VALUES (NEW.id, btrim(NEW.stripe_secret_key), NOW())
    ON CONFLICT (company_id) DO UPDATE
      SET stripe_secret_key = EXCLUDED.stripe_secret_key, updated_at = NOW();
  END IF;
  NEW.stripe_secret_key := NULL;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'stripe_secret_key') THEN
    -- Copy the keys already stored, then clear the column.
    INSERT INTO company_secrets (company_id, stripe_secret_key, updated_at)
    SELECT id, btrim(stripe_secret_key), NOW()
      FROM companies
     WHERE stripe_secret_key IS NOT NULL AND btrim(stripe_secret_key) <> ''
    ON CONFLICT (company_id) DO UPDATE
      SET stripe_secret_key = EXCLUDED.stripe_secret_key, updated_at = NOW();

    DROP TRIGGER IF EXISTS trg_companies_move_stripe_secret ON companies;
    CREATE TRIGGER trg_companies_move_stripe_secret
      BEFORE INSERT OR UPDATE OF stripe_secret_key ON companies
      FOR EACH ROW EXECUTE FUNCTION companies_move_stripe_secret();

    UPDATE companies SET stripe_secret_key = NULL WHERE stripe_secret_key IS NOT NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── Check ───────────────────────────────────────────────────────────────────
-- One row per table. Expect:
--   ai_actions / ai_assistant_events / super_admin_audit   rls on · policies (none)
--   job_runs / api_logs / webhook_events                   platform_admin_read
--   twilio_integrations / prexty_integrations              company_members_read
--   company_secrets                                        rls on · policies (none)
--   anon_can_select = false everywhere; stripe_keys_left_on_companies = 0
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_on,
       COALESCE((SELECT string_agg(p.policyname, ', ') FROM pg_policies p
                  WHERE p.schemaname = 'public' AND p.tablename = c.relname), '(none)') AS policies,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_select,
       (SELECT count(*) FROM companies WHERE stripe_secret_key IS NOT NULL) AS stripe_keys_left_on_companies
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
 WHERE c.relkind = 'r'
   AND c.relname IN ('ai_actions', 'ai_assistant_events', 'super_admin_audit',
                     'job_runs', 'api_logs', 'webhook_events',
                     'twilio_integrations', 'prexty_integrations', 'company_secrets')
 ORDER BY c.relname;
