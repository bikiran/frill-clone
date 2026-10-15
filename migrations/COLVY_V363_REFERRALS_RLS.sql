-- ============================================================
-- COLVY V363 — REFERRALS AND ACCOUNT CREDIT: SERVER ONLY
--
-- V314 created `referrals` and `account_credits` without switching row-level
-- security on, and no migration since has. A table with RLS off is wide open
-- to the public key that ships in the web bundle and the mobile app. Anyone
-- could:
--   • read every business's referrals — the names and emails of the
--     businesses they referred;
--   • INSERT into account_credits, the ledger a company's Colvy credit balance
--     is summed from — i.e. give any workspace (their own) free credit;
--   • mark a referral 'qualified', or delete the history.
--
-- Nothing in the browser reads or writes either table. Every reader and writer
-- is on the server with the service role, which bypasses RLS:
--   /api/referrals                       the Referrals page (it calls the API)
--   /api/auth/complete-signup            records a ?ref= sign-up as pending
--   /api/stripe/webhook                  qualifies it and adds the $100 credit
--   /api/platform-admin/company-credit   super-admin credit and history
--   lib/referrals.ts                     the balance helper the routes above use
--
-- After this: RLS on, no policies, and no table privileges at all for anon or
-- authenticated — so the API roles can't reach them even if someone later adds
-- a permissive policy by hand.
--
-- Like V351 this drops EVERY policy on the two tables, whatever it's called.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. Step 2: rls_on = true and policies = 0 for both tables.
--   2. Settings → Referrals still shows your link, your referrals and credit.
--   3. Platform admin → a company → Credit still lists and adds credit.
--   4. With the anon key: `select * from account_credits` is refused.
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 1: lock both tables ────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  r RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['referrals', 'account_credits'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = t) THEN
      RAISE NOTICE '% does not exist — skipped (run V314 first)', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    FOR r IN SELECT policyname FROM pg_policies
              WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
      RAISE NOTICE 'dropped % on %', r.policyname, t;
    END LOOP;

    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 2: confirm ─────────────────────────────────────────────────────────
-- Expect rls_on = true, policies = 0, api_grants = 0 on both.
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_on,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies,
       (SELECT count(*) FROM information_schema.role_table_grants g
         WHERE g.table_schema = 'public' AND g.table_name = c.relname
           AND g.grantee IN ('anon', 'authenticated')) AS api_grants
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN ('referrals', 'account_credits');

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Only if something breaks and can't wait. This reopens both tables to anyone.
--
--   GRANT ALL ON public.referrals, public.account_credits TO anon, authenticated;
--   ALTER TABLE public.referrals DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.account_credits DISABLE ROW LEVEL SECURITY;
--   NOTIFY pgrst, 'reload schema';
