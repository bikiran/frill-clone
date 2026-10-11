-- ============================================================
-- COLVY V348 — LET A COMPANY'S OWN TEAM READ ITS WOOCOMMERCE CUSTOMERS
--
-- CHECK_OPEN_RLS_POLICIES listed woocommerce_customers under
-- "RLS on, no policy": nobody but the service role can read it. That is safe,
-- but the admin app reads it straight from the browser (Contacts, Inbox
-- customer panel, segments, customer profile, caller ID on incoming calls),
-- so every one of those lookups has been coming back empty.
--
-- This adds ONE read policy: the company's owner and active team members can
-- read their own company's rows. Writes stay server-only (the Woo sync runs
-- with the service role). Strangers still get nothing.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- Same helper as V347 (owner or any active team member). Re-created here so
-- this file works on its own.
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'woocommerce_customers') THEN
    RAISE NOTICE 'woocommerce_customers does not exist — nothing to do';
    RETURN;
  END IF;
  ALTER TABLE public.woocommerce_customers ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS woocommerce_customers_member_read ON public.woocommerce_customers;
  CREATE POLICY woocommerce_customers_member_read ON public.woocommerce_customers
    FOR SELECT TO authenticated
    USING (can_read_company(company_id));
  GRANT SELECT ON public.woocommerce_customers TO authenticated;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT policyname, cmd, roles, qual FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'woocommerce_customers';
