-- ============================================================
-- COLVY V433: keep Inbox-plan features for workspaces already using them
--
-- Live chat, email, Instagram and Messenger (`inbox`), campaigns
-- (`campaigns`), Google reviews and social engagement (`reviewDashboard`),
-- WooCommerce and Prexty orders (`ecommerceSync`) and automatic replies
-- (`aiAutomation`) are now locked to the Inbox and Everything plans
-- (lib/plan-gate). A workspace on Free, Feedback or Business number that was
-- already using one of them keeps it: this grants the feature per company in
-- company_entitlements (V222), shown and removable in super admin → the
-- company → Entitlements.
--
-- Only workspaces on those plans now (not trials, which get everything until
-- they end, and not Inbox and up, which have it anyway). A feature a super
-- admin already set (true or false) is left as it is. "Using" means:
--
--   inbox            an active email inbox (not a web form), an active
--                    Instagram/Messenger channel, or a website live chat in the
--                    last 180 days
--   campaigns        a campaign that isn't a draft
--   reviewDashboard  an active Google Business account, or synced social comments
--   ecommerceSync    an active WooCommerce or Prexty connection
--                    (Shopify isn't locked: its plan is chosen in Shopify)
--   aiAutomation     an active keyword reply, or the AI auto-reply switched on
--
-- Safe to re-run (a workspace already granted is left alone). A table or column
-- that doesn't exist yet is skipped.
--
-- Verify:
--   select company_id, features, reason from company_entitlements
--   where reason like '%V433%' order by updated_at desc;
-- Roll back (removes only what this granted, when nothing else changed):
--   update company_entitlements set features = features - 'inbox' - 'campaigns'
--     - 'reviewDashboard' - 'ecommerceSync' - 'aiAutomation'
--   where reason like 'Kept when Inbox features moved to the Inbox plans%';
-- ============================================================

CREATE OR REPLACE FUNCTION colvy_v433_grant(feature text, users_sql text)
RETURNS integer AS $$
DECLARE n integer := 0;
BEGIN
  BEGIN
    EXECUTE format($q$
      WITH users AS (%s),
      eligible AS (
        SELECT DISTINCT u.company_id FROM users u
        JOIN companies c ON c.id = u.company_id
        WHERE lower(coalesce(c.plan, 'free')) IN ('free', 'feedback', 'phone', 'business_number')
      ),
      done AS (
        INSERT INTO company_entitlements (company_id, features, reason, updated_by, updated_at)
        SELECT company_id, jsonb_build_object(%L, true),
               'Kept when Inbox features moved to the Inbox plans (V433)', 'V433', now()
        FROM eligible
        ON CONFLICT (company_id) DO UPDATE SET
          features = CASE WHEN coalesce(company_entitlements.features, '{}'::jsonb) ? %L
                          THEN company_entitlements.features
                          ELSE coalesce(company_entitlements.features, '{}'::jsonb) || jsonb_build_object(%L, true) END,
          reason = coalesce(company_entitlements.reason, EXCLUDED.reason),
          updated_at = now()
        RETURNING 1
      )
      SELECT count(*) FROM done
    $q$, users_sql, feature, feature, feature) INTO n;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    RAISE NOTICE 'V433: skipped a % check (%).', feature, SQLERRM;
    n := 0;
  END;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE total integer := 0;
BEGIN
  -- Live chat, email, Instagram and Messenger.
  total := total + colvy_v433_grant('inbox', $s$ SELECT company_id FROM email_channels WHERE coalesce(is_active, true) AND coalesce(provider, '') <> 'webform' $s$);
  total := total + colvy_v433_grant('inbox', $s$ SELECT company_id FROM meta_channels WHERE coalesce(is_active, true) $s$);
  total := total + colvy_v433_grant('inbox', $s$ SELECT company_id FROM conversations WHERE channel = 'widget' AND created_at > now() - interval '180 days' $s$);
  -- Campaigns.
  total := total + colvy_v433_grant('campaigns', $s$ SELECT company_id FROM campaigns WHERE coalesce(status, 'draft') <> 'draft' $s$);
  -- Reviews and social engagement.
  total := total + colvy_v433_grant('reviewDashboard', $s$ SELECT company_id FROM google_business_accounts WHERE coalesce(is_active, true) $s$);
  total := total + colvy_v433_grant('reviewDashboard', $s$ SELECT company_id FROM social_comments $s$);
  -- Store orders (WooCommerce, Prexty).
  total := total + colvy_v433_grant('ecommerceSync', $s$ SELECT company_id FROM woocommerce_integrations WHERE coalesce(is_active, true) $s$);
  total := total + colvy_v433_grant('ecommerceSync', $s$ SELECT company_id FROM prexty_integrations WHERE coalesce(is_active, true) $s$);
  -- Automatic replies.
  total := total + colvy_v433_grant('aiAutomation', $s$ SELECT company_id FROM keyword_replies WHERE coalesce(is_active, true) $s$);
  total := total + colvy_v433_grant('aiAutomation', $s$ SELECT company_id FROM ai_settings WHERE coalesce(auto_reply, false) $s$);
  RAISE NOTICE 'V433: % grants written (a workspace can get more than one).', total;
END $$;

DROP FUNCTION IF EXISTS colvy_v433_grant(text, text);
