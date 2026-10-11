-- ============================================================
-- COLVY V352 — COMPANIES: EXACT POLICIES, PROTECTED FIELDS, PLUGIN KEY OUT
--
-- Phase 0b of the Agent Engine work. Checked against production (Oct 2026):
-- companies already has RLS on, with policies created by hand in the
-- dashboard (none of them are in a migration):
--   companies_public_read  [true]                  — anyone can read every column
--   companies_members      [is_company_member(id)] — staff can change any column
--   companies_create       [no check]
--
-- That left three gaps:
--   1. companies.api_key — the Colvy plugin / public API key (WooCommerce
--      plugin, abandoned carts, back-in-stock, /api/v1/ideas) — was readable
--      by anyone, for every business.
--   2. Any team member could change plan, trial, complimentary, demo flags,
--      AI limit, providers, the Stripe Connect account or the owner straight
--      from the browser — e.g. upgrade themselves to Enterprise for free.
--   3. A hand-made insert policy nobody relies on (every signup goes through
--      the server with the service role).
--
-- After this:
--   • Policies are exactly: public read, team-member update, owner delete.
--     (All of them drop-and-recreated, whatever they were called.)
--   • A trigger refuses changes to the protected fields unless they come from
--     Colvy's server (service role) or the platform admin. One exception is
--     kept: a team member of a company with NO owner may claim it for
--     themselves (the billing page does this).
--   • The plugin / API key moves to company_secrets (server only), like the
--     Stripe key in V351, and the same trigger moves any key written to the
--     old column.
--
-- ORDER: deploy the code (PR "Phase 0b") BEFORE running this — the new code
-- reads company_secrets.api_key and falls back to the old column.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- ── 1. Plugin / API key → company_secrets ───────────────────────────────────
ALTER TABLE company_secrets ADD COLUMN IF NOT EXISTS api_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS company_secrets_api_key_uniq ON company_secrets (api_key) WHERE api_key IS NOT NULL;

-- One trigger moves both secrets off the row (replaces V351's Stripe-only one).
CREATE OR REPLACE FUNCTION companies_move_secrets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stripe_secret_key IS NOT NULL AND btrim(NEW.stripe_secret_key) <> '' THEN
    INSERT INTO company_secrets (company_id, stripe_secret_key, updated_at)
    VALUES (NEW.id, btrim(NEW.stripe_secret_key), NOW())
    ON CONFLICT (company_id) DO UPDATE SET stripe_secret_key = EXCLUDED.stripe_secret_key, updated_at = NOW();
  END IF;
  IF NEW.api_key IS NOT NULL AND btrim(NEW.api_key) <> '' THEN
    INSERT INTO company_secrets (company_id, api_key, updated_at)
    VALUES (NEW.id, btrim(NEW.api_key), NOW())
    ON CONFLICT (company_id) DO UPDATE SET api_key = EXCLUDED.api_key, updated_at = NOW();
  END IF;
  NEW.stripe_secret_key := NULL;
  NEW.api_key := NULL;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'api_key') THEN
    ALTER TABLE companies ADD COLUMN api_key TEXT;
  END IF;

  INSERT INTO company_secrets (company_id, api_key, updated_at)
  SELECT id, btrim(api_key), NOW() FROM companies
   WHERE api_key IS NOT NULL AND btrim(api_key) <> ''
  ON CONFLICT (company_id) DO UPDATE SET api_key = EXCLUDED.api_key, updated_at = NOW();

  DROP TRIGGER IF EXISTS trg_companies_move_stripe_secret ON companies;
  DROP TRIGGER IF EXISTS trg_companies_move_secrets ON companies;
  CREATE TRIGGER trg_companies_move_secrets
    BEFORE INSERT OR UPDATE OF stripe_secret_key, api_key ON companies
    FOR EACH ROW EXECUTE FUNCTION companies_move_secrets();

  UPDATE companies SET api_key = NULL WHERE api_key IS NOT NULL;
END $$;

-- ── 2. Protected fields ─────────────────────────────────────────────────────
-- Only Colvy's server (service role / SQL editor) or the platform admin may
-- change these. Normal settings pages never write them.
-- SECURITY INVOKER on purpose: current_user must be the caller's role
-- (authenticated / service_role), not the function owner.
CREATE OR REPLACE FUNCTION companies_guard_protected()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  col TEXT;
  protected TEXT[] := ARRAY[
    'plan', 'plan_changed_at', 'trial_ends_at',
    'is_complimentary', 'complimentary_reason',
    'is_demo', 'demo_read_only', 'demo_expires_at', 'demo_template', 'demo_type',
    'ai_daily_limit', 'free_number_credits',
    'billing_provider', 'billing_integration_id', 'external_sending_enabled',
    'sms_provider', 'voice_provider', 'number_provider',
    'stripe_account_id', 'referral_code',
    'help_domain_verified', 'board_domain_verified',
    'notes', 'assigned_admin_email'
  ];
  o JSONB := to_jsonb(OLD);
  n JSONB := to_jsonb(NEW);
BEGIN
  -- Server (service_role / postgres) and the platform admin are trusted.
  IF current_user NOT IN ('anon', 'authenticated') OR is_platform_admin() THEN
    RETURN NEW;
  END IF;

  FOREACH col IN ARRAY protected LOOP
    IF (n -> col) IS DISTINCT FROM (o -> col) THEN
      RAISE EXCEPTION 'PROTECTED_FIELD: % can only be changed by Colvy', col
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- The owner can't be changed from the browser, except a team member
  -- claiming a company that has no owner yet.
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     AND NOT (OLD.owner_id IS NULL AND NEW.owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'PROTECTED_FIELD: owner_id can only be changed by Colvy'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_companies_guard_protected ON companies;
CREATE TRIGGER trg_companies_guard_protected
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION companies_guard_protected();

-- ── 3. Exact policies ───────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.companies', r.policyname);
  END LOOP;

  -- The board, help centre, widget and booking pages load a company by slug
  -- or domain without signing in.
  CREATE POLICY companies_public_read ON public.companies
    FOR SELECT TO anon, authenticated
    USING (true);

  -- Owner, admins and editors (is_company_member excludes viewers), plus the
  -- platform admin. Protected fields are guarded by the trigger above.
  CREATE POLICY companies_members_update ON public.companies
    FOR UPDATE TO authenticated
    USING (is_company_member(id) OR is_platform_admin())
    WITH CHECK (is_company_member(id) OR is_platform_admin());

  CREATE POLICY companies_owner_delete ON public.companies
    FOR DELETE TO authenticated
    USING (owner_id = auth.uid() OR is_platform_admin());

  -- No INSERT policy: companies are created by the server (signup, OAuth
  -- callback, /api/companies, demos) with the service role.
  REVOKE INSERT ON public.companies FROM anon, authenticated;
  REVOKE UPDATE, DELETE ON public.companies FROM anon;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── Check ───────────────────────────────────────────────────────────────────
-- Expect: policies = companies_members_update, companies_owner_delete,
-- companies_public_read; both triggers present; 0 keys left on companies.
SELECT
  (SELECT string_agg(policyname, ', ' ORDER BY policyname) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'companies')                                   AS policies,
  (SELECT string_agg(tgname, ', ' ORDER BY tgname) FROM pg_trigger
    WHERE tgrelid = 'public.companies'::regclass AND tgname LIKE 'trg_companies_%')            AS triggers,
  (SELECT count(*) FROM companies WHERE api_key IS NOT NULL OR stripe_secret_key IS NOT NULL)   AS keys_left_on_companies,
  (SELECT count(*) FROM company_secrets WHERE api_key IS NOT NULL)                              AS plugin_keys_moved;
