-- ============================================================
-- COLVY V347 — LOCK DOWN company_entitlements
--
-- V222 created company_entitlements with
--   CREATE POLICY "Anyone can manage company_entitlements" ... FOR ALL USING (true)
-- and no TO clause, i.e. TO PUBLIC — anon included. The anon key ships in the
-- web bundle and the mobile app, so anyone could upsert a row for ANY company
-- and switch on every paid feature (removeBranding, customDomain, …) or set
-- unlimited caps — no payment, no sign-in.
--
-- After this migration:
--   • Nobody writes through the API except the service role (server routes:
--     the Stripe webhook for the branding add-on, and the super-admin
--     /api/platform-admin/entitlements route). The service role bypasses RLS.
--   • Signed-in people can READ their own company's row (owner or any active
--     team member, viewers included) — the admin app applies these overrides
--     when it decides which features to show.
--
-- Like V299, this does not guess policy names: it drops EVERY policy on the
-- table, then creates the one read policy.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- Owner or any active team member (viewers included — they still need the
-- admin app to show the right features). SECURITY DEFINER so the lookup isn't
-- itself blocked by the RLS on companies / team_members.
CREATE OR REPLACE FUNCTION can_read_company(target UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM companies c WHERE c.id = target AND c.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM team_members tm
     WHERE tm.company_id = target
       AND tm.user_id = auth.uid()
       AND lower(COALESCE(tm.status, 'active')) <> 'removed'
  );
$$;
REVOKE ALL ON FUNCTION can_read_company(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_read_company(UUID) TO authenticated, service_role;

-- Step 1 (optional): see what is about to be dropped.
-- SELECT policyname, cmd, roles, qual FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'company_entitlements';

DO $$
DECLARE pol record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'company_entitlements') THEN
    RAISE NOTICE 'company_entitlements does not exist — nothing to do';
    RETURN;
  END IF;

  ALTER TABLE public.company_entitlements ENABLE ROW LEVEL SECURITY;

  FOR pol IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'company_entitlements'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.company_entitlements', pol.policyname);
  END LOOP;

  CREATE POLICY company_entitlements_member_read ON public.company_entitlements
    FOR SELECT TO authenticated
    USING (can_read_company(company_id));

  -- Belt and braces: even if a permissive policy is re-added by an old script,
  -- the API roles have no write privilege on the table.
  REVOKE INSERT, UPDATE, DELETE ON public.company_entitlements FROM anon, authenticated;
END $$;

NOTIFY pgrst, 'reload schema';

-- Check: should list exactly one policy, company_entitlements_member_read (SELECT).
SELECT policyname, cmd, roles, qual FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'company_entitlements';
