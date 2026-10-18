-- ============================================================
-- COLVY V398 — SMS BILLING POLICY: PER-COMPANY OVERRIDES
--
-- How a company pays for texts is now a policy (lib/sms-policy.ts), resolved
-- per field: the company's own override, else its plan's default, else the
-- code default (exactly how sending worked before: Enterprise unlimited,
-- Inbox / Everything / trial / pro 3,000 texts a month then prepaid credit,
-- Free and Feedback no SMS).
--   • Plan defaults live in platform_settings, key 'sms_plan_policies'
--     (no schema change: the super admin saves them through
--     /api/platform-admin/sms-policy).
--   • Company overrides live in the new table below.
--
-- Creates:
--   company_sms_policy   one row per company with an override. Every policy
--                        column is nullable: NULL means "inherit from the
--                        plan".
--     sms_mode             'unlimited' | 'allowance_then_credit' |
--                          'credit_only' | 'allowance_only' | 'disabled'
--     monthly_allowance    free parts a month (allowance modes)
--     topup_enabled        the business may buy credit itself on Billing
--     auto_topup_allowed   the business may switch auto top-up on
--     note, updated_by (the super admin's email), updated_at
--
-- Manual charges by the super admin use the existing V395 function
-- (sms_credit_apply, kind 'adjustment', negative amount), which never lets the
-- balance go below zero; a charge bigger than the balance is refused. So the
-- balance CHECK is unchanged and no new function is needed.
--
-- Access (V375 / V382 / V395 style):
--   • SELECT — staff of the company (is_company_member, which leaves out board
--     visitors and removed members) and the platform admin.
--   • INSERT / UPDATE / DELETE — the server only (service role). The platform
--     admin changes overrides through /api/platform-admin/sms-policy, which
--     checks the super admin and writes the audit log. No write policy and no
--     write privilege for anon or authenticated.
--   If is_company_member() is missing, or is still V209's first version, the
--   table is created SERVER ONLY (no read policy) and a notice says so; the
--   app reads it with the service role either way. Run V337 and then this
--   file again to add the read policy.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- Any time, before or after the code from branch claude/sms-billing-controls
-- is deployed. Until it runs, the code treats every company as having no
-- override: plan policies (and, with none saved, today's behaviour) apply,
-- and the company console's SMS billing panel says to run this file.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. The last query lists one policy (company_sms_policy_member_read).
--   2. Super admin → a company → SMS billing: set Mode to Unlimited, Save;
--      "set for this company" shows next to Mode. Reset to plan clears it.
--   3. Signed in as staff (anon key + their token):
--        select * from company_sms_policy;                          → their row only
--        insert into company_sms_policy (company_id) values (...);  → permission denied
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 0: what this builds on ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.companies') IS NULL THEN
    RAISE EXCEPTION 'public.companies does not exist';
  END IF;
END $$;

-- The platform admin check (same body as V351 / V364 / V375 / V395).
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

-- ── STEP 1: the table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_sms_policy (
  company_id          UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  sms_mode            TEXT,
  monthly_allowance   INTEGER,
  topup_enabled       BOOLEAN,
  auto_topup_allowed  BOOLEAN,
  note                TEXT,
  updated_by          TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Columns any hand-made table lacks.
ALTER TABLE public.company_sms_policy
  ADD COLUMN IF NOT EXISTS sms_mode            TEXT,
  ADD COLUMN IF NOT EXISTS monthly_allowance   INTEGER,
  ADD COLUMN IF NOT EXISTS topup_enabled       BOOLEAN,
  ADD COLUMN IF NOT EXISTS auto_topup_allowed  BOOLEAN,
  ADD COLUMN IF NOT EXISTS note                TEXT,
  ADD COLUMN IF NOT EXISTS updated_by          TEXT,
  ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_sms_policy_mode_check') THEN
    ALTER TABLE public.company_sms_policy ADD CONSTRAINT company_sms_policy_mode_check
      CHECK (sms_mode IS NULL OR sms_mode IN ('unlimited', 'allowance_then_credit', 'credit_only', 'allowance_only', 'disabled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_sms_policy_allowance_check') THEN
    ALTER TABLE public.company_sms_policy ADD CONSTRAINT company_sms_policy_allowance_check
      CHECK (monthly_allowance IS NULL OR (monthly_allowance >= 0 AND monthly_allowance <= 10000000));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_sms_policy_note_len') THEN
    ALTER TABLE public.company_sms_policy ADD CONSTRAINT company_sms_policy_note_len
      CHECK (note IS NULL OR char_length(note) <= 500);
  END IF;
END $$;

-- ── STEP 2: access ──────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  member_ok BOOLEAN := to_regprocedure('public.is_company_member(uuid)') IS NOT NULL
    AND pg_get_functiondef(to_regprocedure('public.is_company_member(uuid)')) ILIKE '%''viewer''%';
BEGIN
  ALTER TABLE public.company_sms_policy ENABLE ROW LEVEL SECURITY;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'company_sms_policy' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.company_sms_policy', r.policyname);
  END LOOP;
  REVOKE ALL ON public.company_sms_policy FROM anon, authenticated;
  GRANT ALL ON public.company_sms_policy TO service_role;
  IF member_ok THEN
    CREATE POLICY company_sms_policy_member_read ON public.company_sms_policy
      FOR SELECT TO authenticated USING (is_company_member(company_id) OR is_platform_admin());
    GRANT SELECT ON public.company_sms_policy TO authenticated;
  ELSE
    RAISE NOTICE 'is_company_member() is missing or still counts board visitors: company_sms_policy is server only. Run COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql, then this file again.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 3: check ───────────────────────────────────────────────────────────
SELECT policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'company_sms_policy';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Companies go back to their plan's policy (the code keeps working without
-- the table). Plan policies stay in platform_settings; to drop them too:
--   DELETE FROM platform_settings WHERE key = 'sms_plan_policies';
--
--   DROP TABLE IF EXISTS public.company_sms_policy;
