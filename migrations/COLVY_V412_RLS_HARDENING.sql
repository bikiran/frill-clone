-- ============================================================
-- COLVY V412 — RLS HARDENING: THE TABLES THE PUBLIC KEY COULD STILL REACH
--
-- The browser (and the mobile app) talk to Supabase directly with the public
-- anon key, which ships in the web bundle. Anyone can lift it and query any
-- table the policies allow. Replaying every migration in order, these were
-- still open after V410 (policies with no TO clause apply to PUBLIC, so anon
-- included; PostgreSQL ORs permissive policies, so one USING (true) beats any
-- company check next to it):
--
--   FOR ALL USING (true) — anyone can read, write and delete every business's rows:
--     V275/V279/V282 orders, order_items, order_notes, order_events, shipments,
--                    tracking_events, order_shipments, order_fulfillments
--     V115 calls · V113 company_locations, conversation_notes, conversation_tasks
--     V118 ai_settings, conversation_categories, custom_fields,
--          policies, quick_responses, user_settings · V105 ai_flows, reviews
--     V91  customer_interactions, customer_notes, customer_tags, woocommerce_webhooks
--     V120 woo_sync_jobs · V127 number_regulatory_bundles · V128 phone_numbers
--     V131 doa_claims · V136/V146/V147 abandoned_carts, abandoned_cart_hits
--     V134/V144 order_chat_events · V138 media_requests, media_request_files
--     V142 legal_pages · V151 google_reviews, review_requests · V160
--     keyword_replies, keyword_reply_hits, admin_banners · V161 email_rules,
--     email_signatures · V162 upload_sessions · V163 delivery_updates · V164
--     ai_coupons · V169 support_tickets, ticket_counters · V177 agent_presence
--     V187 help_categories · V188 mention_notifications · V194 campaign_templates
--     V198 call_transfers · V203 task_comments · V207 drafts · V214
--     media_item_notes · V215 impersonation_sessions · V216 company_admin_notes
--     V223 demo_workspaces, demo_analytics · V245 social_posts, social_comments,
--     social_comment_categories · V267 conversation_pins · V273 call_devices
--     V280 order_tags · V285 call_legs · V286 order_stock_alerts · V294
--     trial_nudges · V295 conversation_sales · V296 payment_methods · V317
--     call_handoff_events · V318 ticket_messages · DATABASE_SETUP statuses,
--     help_articles ("Admin can manage help articles" is USING (true)),
--     chat_messages, votes ("Anyone can vote"), ideas (update / delete)
--   RLS never switched on (Supabase grants the API roles everything):
--     telnyx_user_credentials (MIGRATION_V190: per-user SIP passwords),
--     site_settings, user_preferences, media_favorites, terminology, audit_log,
--     idea_attachments; task_activity / woocommerce_orders / notes only got
--     V347's RESTRICTIVE gates, which grant nothing on their own
--   Help-centre analytics: help_article_views, help_article_feedback (the
--     "not helpful" comment carries the visitor's email), help_searches
--     readable by anyone.
--   woocommerce_customers (V348): readable by board visitors (can_read_company
--     counts team role 'viewer') — customer names, emails, phones, addresses.
--   push_tokens: V300 dropped V220's own-device policy and put back
--     is_company_member(company_id), so any coworker could write a token into
--     any colleague's row, and a phone's company_id = NULL row was unclaimable
--     again (the exact V220 bug).
--   storage.objects (V154 / V170): anyone may INSERT, UPDATE, DELETE and LIST
--     every object in chat-attachments, idea-images, media-gallery,
--     media-requests, documents and call-recordings — e.g. list and download
--     every business's call recordings, or overwrite their gallery.
--   colvy_create_ticket() (V169): SECURITY DEFINER, granted to anon — anyone
--     could file tickets into any business. colvy_reload_schema(): same grant.
--
-- After this (every table: RLS on; EVERY permissive policy dropped, whatever
-- it's called, including hand-made ones; RESTRICTIVE policies — V347's team
-- permission gates, V379's message checks — are KEPT; table privileges reset
-- so only what's listed is granted; the service role bypasses RLS and every
-- server route keeps working):
--
--   A. Staff read + write (is_company_member: owner and team, NOT board
--      visitors), platform admin reads. The web admin writes these directly:
--        company_locations orders order_items order_notes order_events
--        order_fulfillments order_shipments order_tags order_stock_alerts
--        shipments calls abandoned_carts campaign_templates
--        conversation_categories conversation_notes conversation_pins
--        conversation_sales conversation_tasks task_comments task_activity
--        customer_interactions customer_notes customer_tags delivery_updates
--        doa_claims email_rules email_signatures keyword_replies
--        media_item_notes media_requests media_request_files
--        mention_notifications payment_methods policies quick_responses
--        social_posts social_comments social_comment_categories
--        support_tickets ticket_messages reviews
--   B. Staff read, server writes (logs, counters, sync state, provisioning):
--        phone_numbers number_regulatory_bundles woo_sync_jobs
--        keyword_reply_hits abandoned_cart_hits call_legs call_transfers
--        call_handoff_events agent_presence order_chat_events tracking_events
--        woocommerce_orders woocommerce_customers woocommerce_webhooks
--        ai_coupons ai_flows ai_settings upload_sessions review_requests
--        google_reviews
--   C. Your own rows only (user_id = auth.uid()):
--        drafts user_settings user_preferences media_favorites call_devices
--   D. Server only: telnyx_user_credentials ticket_counters demo_workspaces
--        demo_analytics trial_nudges chat_messages terminology audit_log
--        idea_attachments
--   E. Platform admin: company_admin_notes (read + write),
--        impersonation_sessions (read; the server writes).
--   F. Public by design, writes by the workspace's staff (rows with no
--      company_id: the platform admin):
--        statuses, custom_fields, site_settings, help_categories,
--        legal_pages — everyone reads every row;
--        admin_banners — everyone reads ACTIVE platform-wide banners;
--        help_articles — everyone reads PUBLISHED articles; staff read all.
--   G. Counters the public pages bump from the browser: help_articles
--      (views, likes) and ideas (votes, likes, views, impressions) keep their
--      public UPDATE, but a BEFORE UPDATE trigger refuses any other column
--      unless the caller is staff of the row's workspace, the platform admin,
--      the idea's author or the server.
--   H. Board: ideas — read and submit as before; delete by staff, the author
--      or the platform admin. votes — read as before; add / remove your own
--      vote; staff of the idea's workspace manage (merge).
--   I. Help-centre analytics: anyone may ADD a view / feedback / search for a
--      published article; only the workspace's staff read them; a signed-in
--      reader may read and change their own feedback.
--   J. feedback_reports: anyone may send one (as themselves); the platform
--      admin and the sender read it.
--   K. push_tokens: back to V220 (your own device rows whatever their
--      company_id, never a token in a company you're not staff of), plus the
--      platform admin reads.
--   L. notes: RLS on and no anon access; its policies are left alone (notes
--      are private to their author; the API serves them).
--   M. storage.objects for those six buckets: anyone may UPLOAD to
--      idea-images (public form uploads, board images); signed-in users may
--      upload to the others; you may read (list), overwrite and delete only
--      objects you uploaded; staff may read and write their own workspace's
--      call-recordings/<company_id>/… . The buckets stay public, so every
--      public URL keeps working; what goes is listing, overwriting and
--      deleting other people's files.
--   N. colvy_create_ticket / colvy_reload_schema: service role only (only
--      /api/tickets calls them, with the service role).
--
-- Deliberately NOT changed here (see the report at the bottom of STEP 15):
-- companies (public read of every column — 51 browser selects use '*'),
-- platform_settings (platform config, read by staff pages), company
-- entitlements (V347: board visitors read on purpose), the board's
-- comments / reactions / activity / idea_likes / idea_subscriptions /
-- idea_images / idea_custom_values / idea_assignments / guest_interactions /
-- segments / analytics_events (public board features; most have no
-- company_id to scope by).
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- AFTER the code from branch audit/rls is deployed (4 small browser changes:
-- the public form uploads without upsert, a guest's help feedback is inserted
-- rather than upserted, the Statuses page and "add sample articles" write the
-- workspace's company_id). The old code works too, except those four.
-- Needs is_company_member() as V337 left it. If it's missing or still V209's
-- original (which counted board visitors), every table here that leans on it
-- is made SERVER ONLY instead, with a notice: run V337, then this file again.
--
-- ⚠️ colvy-mobile isn't in this repo. Group A covers the tables the web
-- writes; group B tables (e.g. phone_numbers, agent_presence) become
-- read-only for staff. If the mobile app writes any of them directly, move
-- that table to the group A list in STEP 2 and re-run.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. STEP 13 lists the new policies; STEP 14 must return no rows; STEP 15
--      lists what is still open (should be only the deliberate ones above).
--   2. As staff (owner / admin / editor): inbox (notes, tasks, pins, sales,
--      quick replies), orders (list, detail, tags, notes, stock alerts,
--      fulfilment, print), calls (dial, record, call log), tasks (comments,
--      activity), locations, CRM settings pages, help centre editor, Statuses,
--      gallery notes, campaigns templates, social, reviews — as before.
--   3. Signed out: the board (vote needs sign-in as before; like / view as a
--      guest), help centre (open an article: views go up; "helpful"),
--      the widget's help tab, a public form with a file upload, a legal page.
--   4. With the anon key:
--        select * from orders;               → permission denied
--        select * from telnyx_user_credentials; → permission denied
--        update help_articles set title = 'x' where status = 'published';
--                                            → "Only views, likes, updated_at can be changed…"
--        delete from ideas;                  → 0 rows
--   5. Signed in as a board visitor (team role viewer): select from orders,
--      woocommerce_customers, support_tickets → 0 rows.
--
-- Run in the Supabase SQL editor (as postgres). Safe to re-run. Rollback at
-- the bottom.
-- ============================================================

-- ── STEP 0: what this builds on ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.companies') IS NULL OR to_regclass('public.team_members') IS NULL THEN
    RAISE EXCEPTION 'public.companies / public.team_members do not exist';
  END IF;
  IF to_regprocedure('public.is_company_member(uuid)') IS NULL THEN
    RAISE NOTICE 'is_company_member(uuid) is missing: every staff table below is made SERVER ONLY. Run COLVY_V209_RLS_PHASE1_CREDENTIALS.sql and COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql, then this file again.';
  ELSIF pg_get_functiondef(to_regprocedure('public.is_company_member(uuid)')) NOT ILIKE '%''viewer''%' THEN
    RAISE NOTICE 'is_company_member(uuid) still counts board visitors (role viewer): every staff table below is made SERVER ONLY. Run COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql, then this file again.';
  END IF;
END $$;

-- The platform admin check (same body as V351 / V364 / V375 / V403 / V404 / V406).
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

-- A uuid from text, or NULL when it isn't one (never an error). For the few
-- tables whose company_id is text (conversation_pins, call_devices,
-- task_activity) and for storage paths.
CREATE OR REPLACE FUNCTION public.colvy_try_uuid(v TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF v IS NULL OR v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  RETURN v::uuid;
END $$;
REVOKE ALL ON FUNCTION public.colvy_try_uuid(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.colvy_try_uuid(TEXT) TO anon, authenticated, service_role;

-- Is V337's is_company_member() in place?
CREATE OR REPLACE FUNCTION pg_temp.colvy_v412_member_ok()
RETURNS BOOLEAN
LANGUAGE sql
AS $$
  SELECT COALESCE(
    to_regprocedure('public.is_company_member(uuid)') IS NOT NULL
    AND pg_get_functiondef(to_regprocedure('public.is_company_member(uuid)')) ILIKE '%''viewer''%',
    false)
$$;

-- RLS on, every PERMISSIVE policy dropped (RESTRICTIVE ones stay: they can
-- only narrow access), API privileges taken away. False if the table doesn't
-- exist here, so the caller skips it.
CREATE OR REPLACE FUNCTION pg_temp.colvy_v412_reset(t TEXT)
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
  FOR r IN SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t AND permissive = 'PERMISSIVE' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    RAISE NOTICE 'dropped % on %', r.policyname, t;
  END LOOP;
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  RETURN true;
END $$;

-- The SQL for "this row's company, as a uuid": the column itself when it's a
-- uuid, colvy_try_uuid(column) when it's text, NULL when there's no such
-- column (or it's some other type).
CREATE OR REPLACE FUNCTION pg_temp.colvy_v412_uuid_col(t TEXT, c TEXT)
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT CASE
           WHEN data_type = 'uuid' THEN quote_ident(c)
           WHEN data_type IN ('text', 'character varying') THEN format('public.colvy_try_uuid(%I)', c)
         END
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = t AND column_name = c
$$;

-- The SQL for "this row is the signed-in user's" on column c, or NULL.
CREATE OR REPLACE FUNCTION pg_temp.colvy_v412_is_me(t TEXT, c TEXT)
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT CASE
           WHEN data_type = 'uuid' THEN format('%I = auth.uid()', c)
           WHEN data_type IN ('text', 'character varying') THEN format('%I = auth.uid()::text', c)
         END
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = t AND column_name = c
$$;

-- Groups A and B: staff of the row's company read (and, with writes, write);
-- the platform admin reads.
CREATE OR REPLACE FUNCTION pg_temp.colvy_v412_staff(t TEXT, writes BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE cid TEXT;
BEGIN
  IF NOT pg_temp.colvy_v412_reset(t) THEN RETURN; END IF;
  cid := pg_temp.colvy_v412_uuid_col(t, 'company_id');
  IF cid IS NULL THEN
    RAISE NOTICE '% has no uuid / text company_id column — left server only', t;
    RETURN;
  END IF;
  IF NOT pg_temp.colvy_v412_member_ok() THEN
    RAISE NOTICE '% is server only until V337 is run (then run this file again)', t;
    RETURN;
  END IF;

  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (is_company_member(%s) OR is_platform_admin())',
                 t || '_member_read', t, cid);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);

  IF writes THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (is_company_member(%s))',
                   t || '_member_insert', t, cid);
    -- WITH CHECK too, so a row can't be handed to another workspace.
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (is_company_member(%s)) WITH CHECK (is_company_member(%s))',
                   t || '_member_update', t, cid, cid);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (is_company_member(%s))',
                   t || '_member_delete', t, cid);
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END IF;
END $$;

-- Group C: the signed-in user's own rows, all operations.
CREATE OR REPLACE FUNCTION pg_temp.colvy_v412_own(t TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE me TEXT;
BEGIN
  IF NOT pg_temp.colvy_v412_reset(t) THEN RETURN; END IF;
  me := pg_temp.colvy_v412_is_me(t, 'user_id');
  IF me IS NULL THEN
    RAISE NOTICE '% has no uuid / text user_id column — left server only', t;
    RETURN;
  END IF;
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
                 t || '_own', t, me, me);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
END $$;

-- Group F: everyone reads the rows public_rows allows; the workspace's staff
-- read and write their own rows; the platform admin reads and writes all
-- (that's the only way to change a row with no company_id).
CREATE OR REPLACE FUNCTION pg_temp.colvy_v412_public(t TEXT, public_rows TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE cid TEXT;
BEGIN
  IF NOT pg_temp.colvy_v412_reset(t) THEN RETURN false; END IF;

  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (%s)',
                 t || '_public_read', t, public_rows);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin())',
                 t || '_platform_admin', t);
  EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);

  cid := pg_temp.colvy_v412_uuid_col(t, 'company_id');
  IF cid IS NULL THEN
    RAISE NOTICE '% has no uuid / text company_id column — only the platform admin (and the server) can change it', t;
  ELSIF NOT pg_temp.colvy_v412_member_ok() THEN
    RAISE NOTICE '% can only be changed by the platform admin (and the server) until V337 is run (then run this file again)', t;
  ELSE
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (is_company_member(%s))',
                   t || '_member_read', t, cid);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (is_company_member(%s))',
                   t || '_member_insert', t, cid);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (is_company_member(%s)) WITH CHECK (is_company_member(%s))',
                   t || '_member_update', t, cid, cid);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (is_company_member(%s))',
                   t || '_member_delete', t, cid);
  END IF;
  RETURN true;
END $$;

-- Group G: on a table the public may UPDATE (to bump counters), only the
-- listed columns may change unless the caller is the server / SQL editor,
-- the platform admin, staff of the row's workspace (and of the one it's moved
-- to), or — when TG_ARGV[0] names an author column — the row's author (who
-- can't move or re-attribute it). TG_ARGV[0] = author column or '';
-- TG_ARGV[1..] = the columns anyone may change. Runs as the caller, so
-- current_user is anon / authenticated for API requests (including the vote
-- and like count triggers they fire) and something else for the server.
CREATE OR REPLACE FUNCTION public.colvy_counter_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_j  JSONB;
  new_j  JSONB;
  old_co UUID;
  new_co UUID;
  author TEXT;
  free   TEXT[];
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  old_j  := to_jsonb(OLD);
  new_j  := to_jsonb(NEW);
  old_co := public.colvy_try_uuid(old_j ->> 'company_id');
  new_co := public.colvy_try_uuid(new_j ->> 'company_id');
  author := NULLIF(TG_ARGV[0], '');
  IF TG_NARGS > 1 THEN
    free := TG_ARGV[1:TG_NARGS - 1];
  ELSE
    free := '{}'::TEXT[];
  END IF;

  IF current_user = 'authenticated' THEN
    IF is_platform_admin() THEN
      RETURN NEW;
    END IF;
    IF old_co IS NOT NULL AND is_company_member(old_co)
       AND (new_co IS NOT DISTINCT FROM old_co OR is_company_member(new_co)) THEN
      RETURN NEW;
    END IF;
    IF author IS NOT NULL AND auth.uid() IS NOT NULL
       AND (old_j ->> author) = auth.uid()::text
       AND (new_j ->> author) IS NOT DISTINCT FROM (old_j ->> author)
       AND new_co IS NOT DISTINCT FROM old_co THEN
      RETURN NEW;
    END IF;
  END IF;

  IF (new_j - free) IS DISTINCT FROM (old_j - free) THEN
    RAISE EXCEPTION 'Only % can be changed on % by someone who is not staff of its workspace',
      array_to_string(free, ', '), TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.colvy_counter_only_guard() FROM PUBLIC, anon, authenticated;

-- ── STEP 1: what is about to be dropped ─────────────────────────────────────
SELECT tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND permissive = 'PERMISSIVE'
   AND tablename IN (
     'company_locations', 'orders', 'order_items', 'order_notes', 'order_events', 'order_fulfillments',
     'order_shipments', 'order_tags', 'order_stock_alerts', 'shipments', 'calls', 'abandoned_carts',
     'campaign_templates', 'conversation_categories', 'conversation_notes', 'conversation_pins',
     'conversation_sales', 'conversation_tasks', 'task_comments', 'task_activity', 'customer_interactions',
     'customer_notes', 'customer_tags', 'delivery_updates', 'doa_claims', 'email_rules', 'email_signatures',
     'keyword_replies', 'media_item_notes', 'media_requests', 'media_request_files', 'mention_notifications',
     'payment_methods', 'policies', 'quick_responses', 'social_posts', 'social_comments',
     'social_comment_categories', 'support_tickets', 'ticket_messages', 'reviews',
     'phone_numbers', 'number_regulatory_bundles', 'woo_sync_jobs', 'keyword_reply_hits',
     'abandoned_cart_hits', 'call_legs', 'call_transfers', 'call_handoff_events', 'agent_presence',
     'order_chat_events', 'tracking_events', 'woocommerce_orders', 'woocommerce_customers',
     'woocommerce_webhooks', 'ai_coupons', 'ai_flows', 'ai_settings', 'upload_sessions', 'review_requests',
     'google_reviews', 'drafts', 'user_settings', 'user_preferences', 'media_favorites', 'call_devices',
     'telnyx_user_credentials', 'ticket_counters', 'demo_workspaces', 'demo_analytics', 'trial_nudges',
     'chat_messages', 'terminology', 'audit_log', 'idea_attachments', 'company_admin_notes',
     'impersonation_sessions', 'statuses', 'custom_fields', 'site_settings', 'help_categories',
     'legal_pages', 'admin_banners', 'help_articles', 'help_article_views', 'help_article_feedback',
     'help_searches', 'ideas', 'votes', 'feedback_reports', 'push_tokens')
 ORDER BY tablename, policyname;

-- ── STEP 2: A — staff read + write ──────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'company_locations', 'orders', 'order_items', 'order_notes', 'order_events', 'order_fulfillments',
    'order_shipments', 'order_tags', 'order_stock_alerts', 'shipments', 'calls', 'abandoned_carts',
    'campaign_templates', 'conversation_categories', 'conversation_notes', 'conversation_pins',
    'conversation_sales', 'conversation_tasks', 'task_comments', 'task_activity', 'customer_interactions',
    'customer_notes', 'customer_tags', 'delivery_updates', 'doa_claims', 'email_rules', 'email_signatures',
    'keyword_replies', 'media_item_notes', 'media_requests', 'media_request_files', 'mention_notifications',
    'payment_methods', 'policies', 'quick_responses', 'social_posts', 'social_comments',
    'social_comment_categories', 'support_tickets', 'ticket_messages', 'reviews'
  ] LOOP
    PERFORM pg_temp.colvy_v412_staff(t, true);
  END LOOP;
END $$;

-- ── STEP 3: B — staff read, the server writes ───────────────────────────────
-- woocommerce_customers was V348's can_read_company (board visitors too).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'phone_numbers', 'number_regulatory_bundles', 'woo_sync_jobs', 'keyword_reply_hits',
    'abandoned_cart_hits', 'call_legs', 'call_transfers', 'call_handoff_events', 'agent_presence',
    'order_chat_events', 'tracking_events', 'woocommerce_orders', 'woocommerce_customers',
    'woocommerce_webhooks', 'ai_coupons', 'ai_flows', 'ai_settings', 'upload_sessions', 'review_requests',
    'google_reviews'
  ] LOOP
    PERFORM pg_temp.colvy_v412_staff(t, false);
  END LOOP;
END $$;

-- ── STEP 4: C — your own rows ───────────────────────────────────────────────
-- Composer drafts (lib/drafts.ts), My profile settings, per-user preferences,
-- gallery favourites, call devices. Nobody needs a colleague's.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['drafts', 'user_settings', 'user_preferences', 'media_favorites', 'call_devices'] LOOP
    PERFORM pg_temp.colvy_v412_own(t);
  END LOOP;
END $$;

-- ── STEP 5: D / E — server only, platform admin ─────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  -- No policy, no privilege for the API roles. telnyx_user_credentials holds
  -- SIP passwords (the token / webhook routes read it with the service role).
  FOREACH t IN ARRAY ARRAY[
    'telnyx_user_credentials', 'ticket_counters', 'demo_workspaces', 'demo_analytics', 'trial_nudges',
    'chat_messages', 'terminology', 'audit_log', 'idea_attachments'
  ] LOOP
    PERFORM pg_temp.colvy_v412_reset(t);
  END LOOP;

  -- Platform admin → a business → Admin notes (read, add, pin, delete).
  IF pg_temp.colvy_v412_reset('company_admin_notes') THEN
    CREATE POLICY company_admin_notes_platform_admin ON public.company_admin_notes
      FOR ALL TO authenticated
      USING (is_platform_admin())
      WITH CHECK (is_platform_admin());
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_admin_notes TO authenticated;
  END IF;

  -- Platform admin → Impersonation log (read); the server records sessions.
  IF pg_temp.colvy_v412_reset('impersonation_sessions') THEN
    CREATE POLICY impersonation_sessions_platform_admin_read ON public.impersonation_sessions
      FOR SELECT TO authenticated
      USING (is_platform_admin());
    GRANT SELECT ON public.impersonation_sessions TO authenticated;
  END IF;
END $$;

-- ── STEP 6: F — public content, staff write ─────────────────────────────────
DO $$
BEGIN
  -- Board / roadmap statuses, CRM + idea custom fields, board & help-centre
  -- branding (site_settings 'general'), help categories, legal pages.
  PERFORM pg_temp.colvy_v412_public('statuses', 'true');
  PERFORM pg_temp.colvy_v412_public('custom_fields', 'true');
  PERFORM pg_temp.colvy_v412_public('site_settings', 'true');
  PERFORM pg_temp.colvy_v412_public('help_categories', 'true');
  PERFORM pg_temp.colvy_v412_public('legal_pages', 'true');

  -- The admin banner (AdminBanner reads the active platform-wide one;
  -- PlatformBannerAdmin, platform admin only, lists and edits them all).
  IF to_regclass('public.admin_banners') IS NOT NULL THEN
    PERFORM pg_temp.colvy_v412_public('admin_banners', 'company_id IS NULL AND is_active IS NOT FALSE');
  END IF;
END $$;

-- ── STEP 7: G — help articles (published to everyone, counters guarded) ─────
DO $$
BEGIN
  IF NOT pg_temp.colvy_v412_public('help_articles', 'status = ''published''') THEN RETURN; END IF;

  -- The help centre and the widget add one to views / likes from the browser.
  CREATE POLICY help_articles_public_counters ON public.help_articles
    FOR UPDATE TO anon, authenticated
    USING (status = 'published')
    WITH CHECK (status = 'published');
  GRANT UPDATE ON public.help_articles TO anon;

  DROP TRIGGER IF EXISTS aaa_colvy_v412_counter_guard ON public.help_articles;
  CREATE TRIGGER aaa_colvy_v412_counter_guard
    BEFORE UPDATE ON public.help_articles
    FOR EACH ROW EXECUTE FUNCTION public.colvy_counter_only_guard('', 'views', 'likes', 'updated_at');
END $$;

-- ── STEP 8: I — help-centre analytics ───────────────────────────────────────
-- Anyone may add a row about a PUBLISHED article (the sub-select runs as the
-- caller, so a stranger only sees published ones anyway), filed under that
-- article's workspace. Only the workspace's staff read them (Help → Analytics).
DO $$
DECLARE
  member_ok BOOLEAN := pg_temp.colvy_v412_member_ok();
  me TEXT;
BEGIN
  IF pg_temp.colvy_v412_reset('help_article_views') THEN
    CREATE POLICY help_article_views_public_insert ON public.help_article_views
      FOR INSERT TO anon, authenticated
      WITH CHECK (
        article_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.help_articles a
                     WHERE a.id::text = help_article_views.article_id::text
                       AND a.status = 'published'
                       AND (a.company_id IS NULL OR help_article_views.company_id IS NULL
                            OR a.company_id::text = help_article_views.company_id::text))
      );
    GRANT INSERT ON public.help_article_views TO anon, authenticated;
    IF member_ok THEN
      CREATE POLICY help_article_views_member_read ON public.help_article_views
        FOR SELECT TO authenticated
        USING (is_company_member(company_id) OR is_platform_admin());
    ELSE
      CREATE POLICY help_article_views_member_read ON public.help_article_views
        FOR SELECT TO authenticated
        USING (is_platform_admin());
    END IF;
    GRANT SELECT ON public.help_article_views TO authenticated;
  END IF;

  IF pg_temp.colvy_v412_reset('help_article_feedback') THEN
    me := COALESCE(pg_temp.colvy_v412_is_me('help_article_feedback', 'user_id'), 'false');
    EXECUTE format($p$
      CREATE POLICY help_article_feedback_public_insert ON public.help_article_feedback
        FOR INSERT TO anon, authenticated
        WITH CHECK (
          (user_id IS NULL OR %s)
          AND article_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.help_articles a
                       WHERE a.id::text = help_article_feedback.article_id::text
                         AND a.status = 'published'
                         AND (a.company_id IS NULL OR help_article_feedback.company_id IS NULL
                              OR a.company_id::text = help_article_feedback.company_id::text))
        )
    $p$, me);
    -- A signed-in reader's own answer (ArticleClient restores and upserts it).
    EXECUTE format('CREATE POLICY help_article_feedback_own ON public.help_article_feedback FOR SELECT TO authenticated USING (%s)', me);
    EXECUTE format('CREATE POLICY help_article_feedback_own_update ON public.help_article_feedback FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', me, me);
    IF member_ok THEN
      CREATE POLICY help_article_feedback_member_read ON public.help_article_feedback
        FOR SELECT TO authenticated
        USING (is_company_member(company_id) OR is_platform_admin());
    ELSE
      CREATE POLICY help_article_feedback_member_read ON public.help_article_feedback
        FOR SELECT TO authenticated
        USING (is_platform_admin());
    END IF;
    GRANT INSERT ON public.help_article_feedback TO anon;
    GRANT SELECT, INSERT, UPDATE ON public.help_article_feedback TO authenticated;
  END IF;

  IF pg_temp.colvy_v412_reset('help_searches') THEN
    CREATE POLICY help_searches_public_insert ON public.help_searches
      FOR INSERT TO anon, authenticated
      WITH CHECK (company_id IS NULL
                  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id::text = help_searches.company_id::text));
    GRANT INSERT ON public.help_searches TO anon, authenticated;
    IF member_ok THEN
      CREATE POLICY help_searches_member_read ON public.help_searches
        FOR SELECT TO authenticated
        USING (is_company_member(company_id) OR is_platform_admin());
    ELSE
      CREATE POLICY help_searches_member_read ON public.help_searches
        FOR SELECT TO authenticated
        USING (is_platform_admin());
    END IF;
    GRANT SELECT ON public.help_searches TO authenticated;
  END IF;
END $$;

-- ── STEP 9: H — the board: ideas and votes ──────────────────────────────────
DO $$
DECLARE member_ok BOOLEAN := pg_temp.colvy_v412_member_ok();
BEGIN
  IF pg_temp.colvy_v412_reset('ideas') THEN
    -- The board, roadmap, profile and embeds read ideas with the public key.
    CREATE POLICY ideas_public_read ON public.ideas
      FOR SELECT TO anon, authenticated
      USING (true);
    -- Anyone may post an idea (guests too, and the board's first-visit sample
    -- ideas), but not in someone else's name.
    CREATE POLICY ideas_public_insert ON public.ideas
      FOR INSERT TO anon, authenticated
      WITH CHECK (user_id IS NULL OR user_id::text = auth.uid()::text);
    -- Votes / likes / views are counted from the browser; the guard trigger
    -- below lets only those columns change for anyone but staff / the author.
    CREATE POLICY ideas_public_counters ON public.ideas
      FOR UPDATE TO anon, authenticated
      USING (true)
      WITH CHECK (true);
    IF member_ok THEN
      CREATE POLICY ideas_delete ON public.ideas
        FOR DELETE TO authenticated
        USING (is_company_member(company_id) OR is_platform_admin()
               OR (user_id IS NOT NULL AND user_id::text = auth.uid()::text));
    ELSE
      CREATE POLICY ideas_delete ON public.ideas
        FOR DELETE TO authenticated
        USING (is_platform_admin() OR (user_id IS NOT NULL AND user_id::text = auth.uid()::text));
    END IF;
    GRANT SELECT, INSERT, UPDATE ON public.ideas TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.ideas TO authenticated;

    DROP TRIGGER IF EXISTS aaa_colvy_v412_counter_guard ON public.ideas;
    CREATE TRIGGER aaa_colvy_v412_counter_guard
      BEFORE UPDATE ON public.ideas
      FOR EACH ROW EXECUTE FUNCTION public.colvy_counter_only_guard(
        'user_id', 'votes', 'likes', 'views', 'impressions', 'vote_score', 'updated_at');
  END IF;

  IF pg_temp.colvy_v412_reset('votes') THEN
    -- Vote counts and the voter list are public on the board.
    CREATE POLICY votes_public_read ON public.votes
      FOR SELECT TO anon, authenticated
      USING (true);
    CREATE POLICY votes_own_insert ON public.votes
      FOR INSERT TO authenticated
      WITH CHECK (user_id::text = auth.uid()::text);
    CREATE POLICY votes_own_delete ON public.votes
      FOR DELETE TO authenticated
      USING (user_id::text = auth.uid()::text);
    -- Merging ideas moves / removes other people's votes: staff of the idea's
    -- workspace only.
    IF member_ok THEN
      CREATE POLICY votes_member_manage ON public.votes
        FOR ALL TO authenticated
        USING (is_platform_admin()
               OR EXISTS (SELECT 1 FROM public.ideas i WHERE i.id = votes.idea_id AND is_company_member(i.company_id)))
        WITH CHECK (is_platform_admin()
               OR EXISTS (SELECT 1 FROM public.ideas i WHERE i.id = votes.idea_id AND is_company_member(i.company_id)));
    ELSE
      CREATE POLICY votes_member_manage ON public.votes
        FOR ALL TO authenticated
        USING (is_platform_admin())
        WITH CHECK (is_platform_admin());
    END IF;
    GRANT SELECT ON public.votes TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.votes TO authenticated;
  END IF;
END $$;

-- ── STEP 10: J — feedback_reports ───────────────────────────────────────────
-- The Feedback button inserts (no read-back); the platform admin reads them.
DO $$
DECLARE me TEXT;
BEGIN
  IF NOT pg_temp.colvy_v412_reset('feedback_reports') THEN RETURN; END IF;
  me := COALESCE(pg_temp.colvy_v412_is_me('feedback_reports', 'user_id'), 'false');
  EXECUTE format('CREATE POLICY feedback_reports_insert ON public.feedback_reports FOR INSERT TO anon, authenticated WITH CHECK (user_id IS NULL OR %s)', me);
  EXECUTE format('CREATE POLICY feedback_reports_read ON public.feedback_reports FOR SELECT TO authenticated USING (is_platform_admin() OR %s)', me);
  GRANT INSERT ON public.feedback_reports TO anon;
  GRANT SELECT, INSERT ON public.feedback_reports TO authenticated;
END $$;

-- ── STEP 11: K / L — push_tokens, notes ─────────────────────────────────────
DO $$
BEGIN
  IF pg_temp.colvy_v412_reset('push_tokens') THEN
    IF pg_temp.colvy_v412_member_ok() THEN
      -- V220, exactly (the phone upserts / deletes its own row at launch,
      -- before a workspace is chosen, so company_id may be NULL).
      CREATE POLICY push_tokens_own_or_member ON public.push_tokens
        FOR ALL TO authenticated
        USING (user_id = auth.uid() OR is_company_member(company_id))
        WITH CHECK (user_id = auth.uid() AND (company_id IS NULL OR is_company_member(company_id)));
    ELSE
      CREATE POLICY push_tokens_own_or_member ON public.push_tokens
        FOR ALL TO authenticated
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid() AND company_id IS NULL);
    END IF;
    -- Platform admin → device diagnostics.
    CREATE POLICY push_tokens_platform_admin_read ON public.push_tokens
      FOR SELECT TO authenticated
      USING (is_platform_admin());
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated;
  END IF;

  -- notes: private to their author unless shared (V235); served by /api/notes
  -- with the service role. Only make sure RLS is on and anon has nothing; any
  -- policies are left as they are.
  IF to_regclass('public.notes') IS NOT NULL THEN
    ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.notes FROM anon;
  END IF;
END $$;

-- ── STEP 12: M / N — storage and functions ──────────────────────────────────
DO $$
DECLARE
  b TEXT;
  own TEXT;
  member_ok BOOLEAN := pg_temp.colvy_v412_member_ok();
  all_buckets CONSTANT TEXT := '''chat-attachments'', ''idea-images'', ''media-gallery'', ''media-requests'', ''documents'', ''call-recordings''';
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects does not exist — storage step skipped';
    RETURN;
  END IF;

  -- Who uploaded an object: owner_id (text) on current Storage, owner (uuid) before.
  own := CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                            WHERE table_schema = 'storage' AND table_name = 'objects' AND column_name = 'owner_id')
              THEN 'owner_id = auth.uid()::text'
              ELSE 'owner = auth.uid()' END;

  -- V154's per-bucket policies (no TO clause: anyone, every operation) and V170's.
  FOREACH b IN ARRAY ARRAY['chat-attachments', 'idea-images', 'media-gallery', 'media-requests', 'documents'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'colvy_read_' || b);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'colvy_insert_' || b);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'colvy_update_' || b);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'colvy_delete_' || b);
  END LOOP;
  DROP POLICY IF EXISTS "Anyone can manage call recordings" ON storage.objects;
  -- This file's own, so a re-run starts clean.
  DROP POLICY IF EXISTS colvy_v412_public_upload ON storage.objects;
  DROP POLICY IF EXISTS colvy_v412_signed_in_upload ON storage.objects;
  DROP POLICY IF EXISTS colvy_v412_own_read ON storage.objects;
  DROP POLICY IF EXISTS colvy_v412_own_update ON storage.objects;
  DROP POLICY IF EXISTS colvy_v412_own_delete ON storage.objects;
  DROP POLICY IF EXISTS colvy_v412_call_recordings_read ON storage.objects;
  DROP POLICY IF EXISTS colvy_v412_call_recordings_insert ON storage.objects;
  DROP POLICY IF EXISTS colvy_v412_call_recordings_update ON storage.objects;

  -- Public form uploads (/forms/<id>), board idea / comment images.
  CREATE POLICY colvy_v412_public_upload ON storage.objects
    FOR INSERT TO anon, authenticated
    WITH CHECK (bucket_id = 'idea-images');
  -- Anything a signed-in client uploads itself (the web uploads these through
  -- the server; the regulatory form uploads to documents).
  CREATE POLICY colvy_v412_signed_in_upload ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id IN ('chat-attachments', 'media-gallery', 'media-requests', 'documents'));
  -- Your own uploads: read (needed by upsert), overwrite, delete.
  EXECUTE format('CREATE POLICY colvy_v412_own_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id IN (%s) AND %s)', all_buckets, own);
  EXECUTE format('CREATE POLICY colvy_v412_own_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id IN (%s) AND %s) WITH CHECK (bucket_id IN (%s) AND %s)', all_buckets, own, all_buckets, own);
  EXECUTE format('CREATE POLICY colvy_v412_own_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id IN (%s) AND %s)', all_buckets, own);

  -- CallBar uploads call-recordings/<company_id>/<call id>.webm with upsert,
  -- possibly over the server's copy: staff of that workspace.
  IF member_ok AND to_regprocedure('storage.foldername(text)') IS NOT NULL THEN
    CREATE POLICY colvy_v412_call_recordings_read ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'call-recordings' AND is_company_member(public.colvy_try_uuid((storage.foldername(name))[1])));
    CREATE POLICY colvy_v412_call_recordings_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'call-recordings' AND is_company_member(public.colvy_try_uuid((storage.foldername(name))[1])));
    CREATE POLICY colvy_v412_call_recordings_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'call-recordings' AND is_company_member(public.colvy_try_uuid((storage.foldername(name))[1])))
      WITH CHECK (bucket_id = 'call-recordings' AND is_company_member(public.colvy_try_uuid((storage.foldername(name))[1])));
  ELSE
    RAISE NOTICE 'call-recordings: only the server can write (browser recordings are not uploaded) until V337 is run and storage.foldername() exists';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'storage.objects policies NOT changed (%): run this file as postgres in the SQL editor.', SQLERRM;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN ('colvy_create_ticket', 'colvy_reload_schema') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 13: confirm ────────────────────────────────────────────────────────
-- Expect, per table: A → <t>_member_read / _insert / _update / _delete;
-- B → <t>_member_read; C → <t>_own; D → none; F → <t>_public_read,
-- <t>_platform_admin, <t>_member_*; plus any RESTRICTIVE perm_* policies.
SELECT tablename, policyname, permissive, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN (
     'company_locations', 'orders', 'order_items', 'order_notes', 'order_events', 'order_fulfillments',
     'order_shipments', 'order_tags', 'order_stock_alerts', 'shipments', 'calls', 'abandoned_carts',
     'campaign_templates', 'conversation_categories', 'conversation_notes', 'conversation_pins',
     'conversation_sales', 'conversation_tasks', 'task_comments', 'task_activity', 'customer_interactions',
     'customer_notes', 'customer_tags', 'delivery_updates', 'doa_claims', 'email_rules', 'email_signatures',
     'keyword_replies', 'media_item_notes', 'media_requests', 'media_request_files', 'mention_notifications',
     'payment_methods', 'policies', 'quick_responses', 'social_posts', 'social_comments',
     'social_comment_categories', 'support_tickets', 'ticket_messages', 'reviews',
     'phone_numbers', 'number_regulatory_bundles', 'woo_sync_jobs', 'keyword_reply_hits',
     'abandoned_cart_hits', 'call_legs', 'call_transfers', 'call_handoff_events', 'agent_presence',
     'order_chat_events', 'tracking_events', 'woocommerce_orders', 'woocommerce_customers',
     'woocommerce_webhooks', 'ai_coupons', 'ai_flows', 'ai_settings', 'upload_sessions', 'review_requests',
     'google_reviews', 'drafts', 'user_settings', 'user_preferences', 'media_favorites', 'call_devices',
     'telnyx_user_credentials', 'ticket_counters', 'demo_workspaces', 'demo_analytics', 'trial_nudges',
     'chat_messages', 'terminology', 'audit_log', 'idea_attachments', 'company_admin_notes',
     'impersonation_sessions', 'statuses', 'custom_fields', 'site_settings', 'help_categories',
     'legal_pages', 'admin_banners', 'help_articles', 'help_article_views', 'help_article_feedback',
     'help_searches', 'ideas', 'votes', 'feedback_reports', 'push_tokens')
 ORDER BY tablename, permissive, policyname;

SELECT policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
 ORDER BY policyname;

-- ── STEP 14: the public key must not be able to write these ─────────────────
-- Should return no rows.
SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee = 'anon'
   AND table_name IN (
     'company_locations', 'orders', 'order_items', 'order_notes', 'order_events', 'order_fulfillments',
     'order_shipments', 'order_tags', 'order_stock_alerts', 'shipments', 'calls', 'abandoned_carts',
     'campaign_templates', 'conversation_categories', 'conversation_notes', 'conversation_pins',
     'conversation_sales', 'conversation_tasks', 'task_comments', 'task_activity', 'customer_interactions',
     'customer_notes', 'customer_tags', 'delivery_updates', 'doa_claims', 'email_rules', 'email_signatures',
     'keyword_replies', 'media_item_notes', 'media_requests', 'media_request_files', 'mention_notifications',
     'payment_methods', 'policies', 'quick_responses', 'social_posts', 'social_comments',
     'social_comment_categories', 'support_tickets', 'ticket_messages', 'reviews',
     'phone_numbers', 'number_regulatory_bundles', 'woo_sync_jobs', 'keyword_reply_hits',
     'abandoned_cart_hits', 'call_legs', 'call_transfers', 'call_handoff_events', 'agent_presence',
     'order_chat_events', 'tracking_events', 'woocommerce_orders', 'woocommerce_customers',
     'woocommerce_webhooks', 'ai_coupons', 'ai_flows', 'ai_settings', 'upload_sessions', 'review_requests',
     'google_reviews', 'drafts', 'user_settings', 'user_preferences', 'media_favorites', 'call_devices',
     'telnyx_user_credentials', 'ticket_counters', 'demo_workspaces', 'demo_analytics', 'trial_nudges',
     'chat_messages', 'terminology', 'audit_log', 'idea_attachments', 'company_admin_notes',
     'impersonation_sessions', 'votes', 'push_tokens', 'notes')
UNION ALL
SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee = 'anon'
   AND privilege_type <> 'SELECT'
   AND table_name IN ('statuses', 'custom_fields', 'site_settings', 'help_categories', 'legal_pages', 'admin_banners')
ORDER BY 1, 2, 3;

-- ── STEP 15: what is still open, anywhere ───────────────────────────────────
-- (a) Tables with RLS off — anyone with the anon key can do anything to them.
SELECT c.relname AS rls_disabled
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
 ORDER BY 1;

-- (b) Permissive policies with no condition, reaching anon or signed-in users.
-- Expected after this file (deliberate): companies_public_read, the board
-- (comments / reactions / activity / idea_* / guest_interactions / segments /
-- analytics_events / idea_likes / idea_subscriptions), forms / contact_forms
-- public reads, platform_settings_read, *_public_read on group F tables,
-- ideas_public_read / ideas_public_counters (guarded by the trigger),
-- votes_public_read. Anything else here is worth a look.
SELECT tablename, policyname, cmd, roles, COALESCE(qual, '(none)') AS qual, COALESCE(with_check, '(none)') AS with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND permissive = 'PERMISSIVE'
   AND (roles::text ILIKE '%public%' OR roles::text ILIKE '%anon%' OR roles::text ILIKE '%authenticated%')
   AND (   (cmd IN ('SELECT', 'DELETE', 'ALL') AND (qual IS NULL OR btrim(qual) = 'true'))
        OR (cmd IN ('INSERT', 'UPDATE', 'ALL') AND (with_check IS NULL OR btrim(with_check) = 'true') AND (qual IS NULL OR btrim(qual) = 'true')))
 ORDER BY tablename, policyname;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Only if something staff rely on stops working and it can't wait for a fix:
-- prefer moving the ONE table to a wider group above and re-running. The
-- blanket version below reopens every hole closed here (anyone with the anon
-- key can read and change every business's orders, calls, tickets, SIP
-- passwords …) — a stopgap only. The audit/rls code keeps working either way.
--
--   DO $$
--   DECLARE t TEXT;
--   BEGIN
--     FOREACH t IN ARRAY ARRAY[ <the tables of STEP 2, 3, 4 and 5> ] LOOP
--       IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
--         EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)', 'Anyone can manage ' || t, t);
--         EXECUTE format('GRANT ALL ON public.%I TO anon, authenticated', t);
--       END IF;
--     END LOOP;
--   END $$;
--   -- woocommerce_customers as V348 left it:
--   CREATE POLICY woocommerce_customers_member_read ON public.woocommerce_customers
--     FOR SELECT TO authenticated USING (can_read_company(company_id));
--   -- Group F / help / board tables: same loop over 'statuses', 'custom_fields',
--   -- 'site_settings', 'help_categories', 'legal_pages', 'admin_banners',
--   -- 'help_articles', 'help_article_views', 'help_article_feedback',
--   -- 'help_searches', 'votes', 'feedback_reports'; and for ideas:
--   CREATE POLICY "Anyone can delete ideas" ON public.ideas FOR DELETE USING (true);
--   GRANT ALL ON public.ideas TO anon, authenticated;
--   DROP TRIGGER IF EXISTS aaa_colvy_v412_counter_guard ON public.ideas;
--   DROP TRIGGER IF EXISTS aaa_colvy_v412_counter_guard ON public.help_articles;
--   DROP FUNCTION IF EXISTS public.colvy_counter_only_guard();
--   -- push_tokens as V300 left it:
--   DROP POLICY IF EXISTS push_tokens_own_or_member ON public.push_tokens;
--   DROP POLICY IF EXISTS push_tokens_platform_admin_read ON public.push_tokens;
--   CREATE POLICY company_members_push_tokens ON public.push_tokens FOR ALL TO authenticated
--     USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
--   -- storage, as V154 / V170 left it:
--   DROP POLICY IF EXISTS colvy_v412_public_upload ON storage.objects;
--   DROP POLICY IF EXISTS colvy_v412_signed_in_upload ON storage.objects;
--   DROP POLICY IF EXISTS colvy_v412_own_read ON storage.objects;
--   DROP POLICY IF EXISTS colvy_v412_own_update ON storage.objects;
--   DROP POLICY IF EXISTS colvy_v412_own_delete ON storage.objects;
--   DROP POLICY IF EXISTS colvy_v412_call_recordings_read ON storage.objects;
--   DROP POLICY IF EXISTS colvy_v412_call_recordings_insert ON storage.objects;
--   DROP POLICY IF EXISTS colvy_v412_call_recordings_update ON storage.objects;
--   -- then re-run the DO block of COLVY_V154_STORAGE_BUCKETS.sql, and:
--   CREATE POLICY "Anyone can manage call recordings" ON storage.objects
--     FOR ALL USING (bucket_id = 'call-recordings') WITH CHECK (bucket_id = 'call-recordings');
--   -- functions:
--   GRANT EXECUTE ON FUNCTION colvy_create_ticket TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION colvy_reload_schema TO anon, authenticated;
--   NOTIFY pgrst, 'reload schema';
