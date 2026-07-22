-- ============================================================
-- COLVY V209 — ROW LEVEL SECURITY, PHASE 1: CREDENTIALS
--
-- WHY THIS MATTERS
-- Every RLS policy in this project was written as `USING (true)`, which permits
-- anyone holding the public anon key — that key ships in the browser, so
-- effectively anyone at all — to read the table. For most tables that's a
-- multi-tenant data leak. For the tables in this file it's worse: they hold
-- live credentials.
--
--   telnyx_integrations       api_key, sip_password
--   google_business_accounts  access_token, refresh_token
--   meta_channels             page_access_token
--   woocommerce_integrations  store consumer key / secret
--   shopify_integrations      access token
--   saved_cards               payment method references
--   push_tokens               device push tokens
--
-- This phase locks exactly those, because it is the highest severity and the
-- lowest risk of breaking anything:
--   • server routes use the service role key, which bypasses RLS entirely
--   • the admin screens that read these are authenticated, so scoping to
--     company membership keeps them working
--   • no public page (widget, help centre, forms) touches any of them
--
-- The customer-facing tables (contacts, conversations, messages) are NOT
-- touched here. The public widget writes to them with the anon key, so locking
-- them without first moving that traffic to server routes would break customer
-- chat. That's phase 2 and needs the widget refactor first.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- ── Membership helper ───────────────────────────────────────────────────────
-- True when the current user owns the company or is a member of its team.
-- SECURITY DEFINER so it can read team_members regardless of that table's own
-- policies, which avoids a policy that depends on itself.
CREATE OR REPLACE FUNCTION is_company_member(target UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM companies c
     WHERE c.id = target AND c.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM team_members tm
     WHERE tm.company_id = target
       AND tm.user_id = auth.uid()
       AND COALESCE(tm.status, 'active') <> 'removed'
  );
$$;

REVOKE ALL ON FUNCTION is_company_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_company_member(UUID) TO authenticated, anon, service_role;

-- ── Apply to each credential table ──────────────────────────────────────────
-- Written as a loop so a table that doesn't exist on this database is skipped
-- rather than aborting the whole migration.
DO $$
DECLARE
  t TEXT;
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
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

      -- Remove the permissive policies this project created.
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'Anyone can manage ' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'Anyone can read ' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'Public read ' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'company_members_' || t, t);

      -- Only members of the owning company, and only when signed in.
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = t AND column_name = 'company_id'
      ) THEN
        EXECUTE format($f$
          CREATE POLICY %I ON %I
            FOR ALL
            TO authenticated
            USING (is_company_member(company_id))
            WITH CHECK (is_company_member(company_id))
        $f$, 'company_members_' || t, t);
      ELSE
        -- No company_id (e.g. a per-user table): scope to the user instead.
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id'
        ) THEN
          EXECUTE format($f$
            CREATE POLICY %I ON %I
              FOR ALL
              TO authenticated
              USING (user_id = auth.uid())
              WITH CHECK (user_id = auth.uid())
          $f$, 'company_members_' || t, t);
        END IF;
      END IF;

      RAISE NOTICE 'RLS locked: %', t;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── After running, verify ───────────────────────────────────────────────────
-- Signed OUT (anon key), this should return zero rows rather than your key:
--     select api_key from telnyx_integrations;
-- Signed IN as a member of the company, it should return your row.
-- The admin Integrations and Channels screens should behave exactly as before.
