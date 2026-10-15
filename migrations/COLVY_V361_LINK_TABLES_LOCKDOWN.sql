-- ============================================================
-- COLVY V361 — LOCK THE LINK TABLES TO THE BUSINESS'S OWN TEAM
--
-- The three tables behind tracked links were still open to anyone holding the
-- public key (it ships in the web page and the mobile app):
--
--   short_links       "Anyone can read short_links"   SELECT  USING (true)  (V115)
--                     "Anyone can manage short_links" ALL     USING (true)  (V115)
--   link_clicks       link_clicks_select              SELECT  USING (true)  (V189)
--                     link_clicks_insert              INSERT  WITH CHECK (true)
--   link_conversions  link_conversions_all            ALL     USING (true)  (V192)
--
-- None of them has a TO clause, so they apply to the public (anon) role too.
-- That meant anyone could list every business's links (who they were sent to,
-- where they point), read every click — including the visitor's IP address,
-- city and device — and read or forge attributed revenue.
--
-- Who uses these tables, checked before writing this:
--   • Server, service role (bypasses RLS, unaffected): the /l/ redirect and the
--     /m/ media viewer, lib/link-click.ts, lib/link-attribution.ts,
--     lib/chat-payment-confirm.ts, lib/short-link.ts, lib/link-tracking.ts,
--     lib/campaign-sender.ts, lib/campaign-audience.ts, lib/booking.ts,
--     lib/waitlist.ts, /api/short-links/create, /api/links/stats (the inbox
--     link cards), /api/links/track, /api/media-requests, /api/shipments/create,
--     /api/payments/backfill-links, /api/stripe/refund, /api/telnyx/sms/send,
--     /api/cron/expire-media, /api/widget/*, /api/book, /api/contact-form/submit.
--   • Browser, signed in as a team member (keeps working — they only read
--     their own company's rows): Links Generator, Link Reports, Campaigns and
--     the campaign report, the Payments page's click history, and the home
--     page's Link clicks card.
--   • No public page (pay links, /p/, /r/, /u/, the widget, booking pages,
--     forms) reads these tables with the public key.
--
-- After this:
--   • signed-in members of the business can READ their own links, clicks and
--     conversions;
--   • nothing in the browser writes them (all writes are server routes), so
--     members get no write policy;
--   • the public key gets nothing at all.
--
-- Like V299/V351/V356 this never guesses policy names: it drops EVERY policy on
-- the three tables, whatever it is called, then creates exactly one.
--
-- Also adds bookings.source_click_id: the tracked-link click a booking came
-- from (a Reel / QR link that opened the booking page), so the booking can be
-- credited to that link once it is confirmed — which, for paid bookings,
-- happens later in the Stripe webhook.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- ── STEP 1: what is about to be dropped ─────────────────────────────────────
SELECT tablename, policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('short_links', 'link_clicks', 'link_conversions')
 ORDER BY tablename, policyname;

-- ── STEP 2: drop every policy, then add one member-read policy ─────────────
DO $$
DECLARE
  t TEXT;
  r RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['short_links', 'link_clicks', 'link_conversions'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = t) THEN
      RAISE NOTICE '% does not exist — skipped', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
      RAISE NOTICE 'dropped % on %', r.policyname, t;
    END LOOP;

    -- The public key gets nothing; members may only read; the server does
    -- every write with the service role.
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR SELECT
        TO authenticated
        USING (is_company_member(company_id))
    $f$, 'company_members_read_' || t, t);
  END LOOP;
END $$;

-- ── STEP 3: smart links — where a booking came from ─────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'bookings') THEN
    ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS source_click_id TEXT;
  END IF;
END $$;

-- Looking up "has this booking / chat already been credited to a link?".
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'link_conversions') THEN
    CREATE INDEX IF NOT EXISTS idx_link_conversions_order
      ON public.link_conversions (company_id, order_id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 4: confirm ─────────────────────────────────────────────────────────
-- Expect one row per table: rls_on = true, anon_can_select = false,
-- open_policies = 0, and policies = company_members_read_<table>.
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_on,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_select,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname
           AND (p.qual = 'true' OR p.with_check = 'true'
                OR 'public' = ANY (p.roles) OR 'anon' = ANY (p.roles))) AS open_policies,
       (SELECT string_agg(p.policyname, ', ') FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
 WHERE c.relname IN ('short_links', 'link_clicks', 'link_conversions')
 ORDER BY c.relname;

-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. Signed OUT, `select * from link_clicks;` with the public key returns 0 rows.
--   2. Tap a tracked link (/l/<code>) — it still redirects, and the click shows
--      in Link Reports.
--   3. Links Generator, Link Reports, a campaign report and the home page's
--      Link clicks card still show your links.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Only if something breaks and cannot wait. This reopens the leak.
--
--   CREATE POLICY "Anyone can manage short_links" ON public.short_links FOR ALL USING (true);
--   CREATE POLICY link_clicks_select ON public.link_clicks FOR SELECT USING (true);
--   CREATE POLICY link_conversions_all ON public.link_conversions FOR ALL USING (true) WITH CHECK (true);
--   GRANT SELECT ON public.short_links, public.link_clicks, public.link_conversions TO anon;
--   NOTIFY pgrst, 'reload schema';
