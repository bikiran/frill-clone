-- ============================================================
-- COLVY V394 — SMS CAMPAIGNS: ATOMIC USAGE, PAUSE REASONS, LOCKED-DOWN PRICES
--
-- Goes with branch claude/sms-campaigns-fix. That code works before AND after
-- this runs (every piece below has a fallback in the code), so it can run any
-- time after the deploy — but until it does:
--   • SMS usage is counted read-then-write (two sends at once can both slip
--     under the monthly allowance);
--   • a paused campaign shows no reason;
--   • a send that died part-way is only reclaimed once the whole campaign has
--     been idle 10 minutes;
--   • anyone holding the public key can still edit sms_pricing, and any
--     signed-in user can read every workspace's campaigns and recipients.
--
-- What it does:
--   1. sms_usage_add(company, period, n, cap) — adds n message PARTS to the
--      month's usage in one UPDATE … SET sent = sent + n RETURNING, refusing
--      (returning NULL, changing nothing) when a cap would be passed. The
--      campaign sender reserves each text's parts with it before sending.
--   2. campaign_bump_counts(campaign, delivered, failed) — delivery receipts
--      move a campaign's counters by increment instead of two exact COUNTs
--      over every recipient per receipt.
--   3. campaigns.status_reason (why a campaign paused), campaigns.
--      excluded_breakdown (who was left out at send time, by reason),
--      campaign_recipients.claimed_at (when a send run claimed the row).
--   4. order_items (company_id) and a trigram index on product_name, for the
--      "bought a product" audience (Shopify buyers are found from order lines).
--   5. sms_pricing: read by the workspace's staff and the platform admin;
--      written only by the server (service role) and the platform admin.
--      V196 left it FOR ALL USING (true): anyone with the public key could
--      change any workspace's price per part.
--   6. campaigns: staff of the campaign's workspace only (it was any signed-in
--      user, any workspace). campaign_recipients: staff may read their own;
--      writes are the server's (it was open to everyone, anon included —
--      every recipient's name and mobile).
--
-- Board visitors (team role 'viewer') are not staff — is_company_member as
-- V337 left it. Needs is_company_member() (V209 + V337); stops with an error,
-- changing nothing, if it's missing or still counts viewers.
--
-- Timing: the index builds in step 4 take a write lock on order_items for as
-- long as they run (seconds for tens of thousands of rows); run outside busy
-- order hours if the table is large. Everything else is instant.
--
-- The mobile app (colvy-mobile) doesn't read or write any of these tables.
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 0: what this builds on ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.is_company_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'is_company_member(uuid) is missing — run COLVY_V209_RLS_PHASE1_CREDENTIALS.sql and COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql first';
  END IF;
  IF pg_get_functiondef(to_regprocedure('public.is_company_member(uuid)')) NOT ILIKE '%''viewer''%' THEN
    RAISE EXCEPTION 'is_company_member(uuid) still counts board visitors (role viewer) as members — run COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql first';
  END IF;
END $$;

-- The platform admin check (same body as V351 / V364 / V375).
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

-- ── STEP 1: atomic SMS usage, counted in parts ──────────────────────────────
CREATE OR REPLACE FUNCTION sms_usage_add(p_company UUID, p_period TEXT, p_n INTEGER, p_cap INTEGER DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v INTEGER;
BEGIN
  INSERT INTO sms_usage (company_id, period, sent) VALUES (p_company, p_period, 0)
  ON CONFLICT (company_id, period) DO NOTHING;
  -- One statement: the row lock makes concurrent reservations queue, and the
  -- cap is checked against the value each one actually sees.
  UPDATE sms_usage
     SET sent = GREATEST(0, sent + p_n), updated_at = now()
   WHERE company_id = p_company AND period = p_period
     AND (p_cap IS NULL OR p_n <= 0 OR sent + p_n <= p_cap)
  RETURNING sent INTO v;
  RETURN v;   -- NULL: the cap would have been passed, nothing added
END $$;
REVOKE ALL ON FUNCTION sms_usage_add(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION sms_usage_add(UUID, TEXT, INTEGER, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION sms_usage_add(UUID, TEXT, INTEGER, INTEGER) TO service_role;

-- ── STEP 2: campaign counters by increment ──────────────────────────────────
CREATE OR REPLACE FUNCTION campaign_bump_counts(p_campaign UUID, p_delivered INTEGER, p_failed INTEGER)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE campaigns
     SET delivered_count = GREATEST(0, COALESCE(delivered_count, 0) + p_delivered),
         failed_count    = GREATEST(0, COALESCE(failed_count, 0) + p_failed)
   WHERE id = p_campaign
$$;
REVOKE ALL ON FUNCTION campaign_bump_counts(UUID, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION campaign_bump_counts(UUID, INTEGER, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION campaign_bump_counts(UUID, INTEGER, INTEGER) TO service_role;

-- ── STEP 3: columns ─────────────────────────────────────────────────────────
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS status_reason TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS excluded_breakdown JSONB;
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_provider
  ON campaign_recipients (provider_id) WHERE provider_id IS NOT NULL;

-- ── STEP 4: order-line lookups for the product audience ─────────────────────
DO $$
BEGIN
  IF to_regclass('public.order_items') IS NULL THEN
    RAISE NOTICE 'order_items does not exist — skipped';
    RETURN;
  END IF;
  CREATE INDEX IF NOT EXISTS idx_order_items_company ON public.order_items (company_id);
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS idx_order_items_name_trgm ON public.order_items USING gin (product_name gin_trgm_ops);
  END IF;
END $$;

-- Switches RLS on and drops every policy on a table (whatever it's called),
-- then takes away the API roles' privileges; each step grants back exactly
-- what's needed. False if the table doesn't exist here.
CREATE OR REPLACE FUNCTION pg_temp.colvy_v394_reset(t TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE r RECORD;
BEGIN
  IF to_regclass(format('public.%I', t)) IS NULL THEN
    RAISE NOTICE '% does not exist — skipped', t;
    RETURN false;
  END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    RAISE NOTICE 'dropped % on %', r.policyname, t;
  END LOOP;
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  RETURN true;
END $$;

-- ── STEP 5: sms_pricing ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT pg_temp.colvy_v394_reset('sms_pricing') THEN RETURN; END IF;

  -- The campaign editor reads its workspace's price row (as the member).
  CREATE POLICY sms_pricing_member_read ON public.sms_pricing
    FOR SELECT TO authenticated
    USING (is_company_member(company_id) OR is_platform_admin());

  -- Prices are a platform decision: only the platform admin may change them
  -- from a browser. The server (service role) bypasses RLS.
  CREATE POLICY sms_pricing_platform_insert ON public.sms_pricing
    FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
  CREATE POLICY sms_pricing_platform_update ON public.sms_pricing
    FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
  CREATE POLICY sms_pricing_platform_delete ON public.sms_pricing
    FOR DELETE TO authenticated USING (is_platform_admin());

  GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_pricing TO authenticated;
END $$;

-- ── STEP 6: campaigns and campaign_recipients ───────────────────────────────
DO $$
BEGIN
  IF NOT pg_temp.colvy_v394_reset('campaigns') THEN RETURN; END IF;

  -- The campaign list, builder and report work as the signed-in member.
  CREATE POLICY campaigns_member_read ON public.campaigns
    FOR SELECT TO authenticated
    USING (is_company_member(company_id) OR is_platform_admin());
  CREATE POLICY campaigns_member_insert ON public.campaigns
    FOR INSERT TO authenticated
    WITH CHECK (is_company_member(company_id));
  -- WITH CHECK as well, so a campaign can't be handed to another workspace.
  CREATE POLICY campaigns_member_update ON public.campaigns
    FOR UPDATE TO authenticated
    USING (is_company_member(company_id))
    WITH CHECK (is_company_member(company_id));
  CREATE POLICY campaigns_member_delete ON public.campaigns
    FOR DELETE TO authenticated
    USING (is_company_member(company_id));

  GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
END $$;

DO $$
BEGIN
  IF NOT pg_temp.colvy_v394_reset('campaign_recipients') THEN RETURN; END IF;

  -- The report reads its campaign's recipients; the sender (service role)
  -- writes them.
  CREATE POLICY campaign_recipients_member_read ON public.campaign_recipients
    FOR SELECT TO authenticated
    USING (is_company_member(company_id) OR is_platform_admin());

  GRANT SELECT ON public.campaign_recipients TO authenticated;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 7: confirm ─────────────────────────────────────────────────────────
-- Expect: sms_pricing_member_read / _platform_insert / _update / _delete;
-- campaigns_member_read / _insert / _update / _delete;
-- campaign_recipients_member_read. All {authenticated}.
SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('sms_pricing', 'campaigns', 'campaign_recipients')
 ORDER BY tablename, policyname;

-- ── NOTE: per-company price rows ────────────────────────────────────────────
-- V196 seeded an sms_pricing row for EVERY company. lib/sms-pricing.ts lets a
-- company's own row win over the platform-wide price (platform_settings
-- 'sms_pricing'), so a change made in the platform console doesn't reach any
-- company that existed when V196 ran. This migration doesn't change that
-- (the billing model is being decided separately). To see who is pinned:
--   select company_id, price_per_part, volume_tiers, updated_at from sms_pricing;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- The code from claude/sms-campaigns-fix keeps working after a rollback.
-- Reopening the policies reopens exactly the holes described above.
--
-- DROP FUNCTION IF EXISTS sms_usage_add(UUID, TEXT, INTEGER, INTEGER);
-- DROP FUNCTION IF EXISTS campaign_bump_counts(UUID, INTEGER, INTEGER);
-- DROP INDEX IF EXISTS idx_order_items_name_trgm;
-- DROP INDEX IF EXISTS idx_order_items_company;
-- DROP INDEX IF EXISTS idx_campaign_recipients_provider;
-- (the three columns are harmless to keep; to drop them:)
-- ALTER TABLE campaigns DROP COLUMN IF EXISTS status_reason;
-- ALTER TABLE campaigns DROP COLUMN IF EXISTS excluded_breakdown;
-- ALTER TABLE campaign_recipients DROP COLUMN IF EXISTS claimed_at;
--
-- DROP POLICY IF EXISTS sms_pricing_member_read ON sms_pricing;
-- DROP POLICY IF EXISTS sms_pricing_platform_insert ON sms_pricing;
-- DROP POLICY IF EXISTS sms_pricing_platform_update ON sms_pricing;
-- DROP POLICY IF EXISTS sms_pricing_platform_delete ON sms_pricing;
-- CREATE POLICY sms_pricing_all ON sms_pricing FOR ALL USING (true) WITH CHECK (true);
-- GRANT ALL ON sms_pricing TO anon, authenticated;
--
-- DROP POLICY IF EXISTS campaigns_member_read ON campaigns;
-- DROP POLICY IF EXISTS campaigns_member_insert ON campaigns;
-- DROP POLICY IF EXISTS campaigns_member_update ON campaigns;
-- DROP POLICY IF EXISTS campaigns_member_delete ON campaigns;
-- CREATE POLICY campaigns_all ON campaigns FOR ALL
--   USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
-- GRANT ALL ON campaigns TO anon, authenticated;
--
-- DROP POLICY IF EXISTS campaign_recipients_member_read ON campaign_recipients;
-- CREATE POLICY campaign_recipients_all ON campaign_recipients FOR ALL USING (true) WITH CHECK (true);
-- GRANT ALL ON campaign_recipients TO anon, authenticated;
-- NOTIFY pgrst, 'reload schema';
