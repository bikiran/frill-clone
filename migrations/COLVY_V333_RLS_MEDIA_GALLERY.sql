-- ============================================================
-- COLVY V333 — LOCK THE GALLERY TABLES TO THEIR OWN WORKSPACE
--
-- media_folders, media_items, media_categories and media_item_categories were
-- created (V135, V165) with `FOR ALL USING (true)` and no TO clause, i.e. TO
-- PUBLIC, anon included. The anon key ships in the web bundle and the Android
-- app, so anyone could read, rename, move or delete any workspace's gallery
-- and albums. V209/V210/V299 locked other tables; these were never included.
--
-- Who still reaches these tables after this:
--   • the admin Gallery / inbox pages and the mobile app, signed in, as a
--     member of the workspace — allowed by is_company_member (V209)
--   • server routes (/api/media*, transcode, cron, upload sessions), which use
--     the service role and bypass RLS. /api/media* now also check the caller.
-- No public page reads these tables with the anon key.
--
-- Like V299, this drops EVERY policy on these tables except the
-- company_members_* ones, whatever they're called, rather than guessing names.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. Step 3: one company_members_* policy per table, TO authenticated.
--   2. Signed OUT, `select count(*) from media_items;` returns 0 rows visible.
--   3. Web Gallery: browse, upload, make/rename/delete a folder, categories.
--   4. Mobile Gallery: browse, upload, New album, move items into an album.
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 1: what is about to be dropped ─────────────────────────────────────
SELECT tablename, policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('media_folders', 'media_items', 'media_categories', 'media_item_categories')
   AND policyname <> 'company_members_' || tablename
 ORDER BY tablename, policyname;

-- ── STEP 2: drop them, then add the member policy ──────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('media_folders', 'media_items', 'media_categories', 'media_item_categories')
       AND policyname <> 'company_members_' || tablename
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'dropped % on %', r.policyname, r.tablename;
  END LOOP;
END $$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['media_folders', 'media_items', 'media_categories'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'company_members_' || t, t);
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I
          FOR ALL
          TO authenticated
          USING (is_company_member(company_id))
          WITH CHECK (is_company_member(company_id))
      $f$, 'company_members_' || t, t);
    END IF;
  END LOOP;
END $$;

-- media_item_categories.company_id is nullable (older rows may not carry it),
-- so fall back to the linked item's workspace when it's missing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'media_item_categories') THEN
    ALTER TABLE public.media_item_categories ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS company_members_media_item_categories ON public.media_item_categories;
    CREATE POLICY company_members_media_item_categories ON public.media_item_categories
      FOR ALL
      TO authenticated
      USING (
        CASE WHEN company_id IS NOT NULL THEN is_company_member(company_id)
             ELSE EXISTS (SELECT 1 FROM public.media_items mi
                           WHERE mi.id = media_item_id AND is_company_member(mi.company_id))
        END
      )
      WITH CHECK (
        CASE WHEN company_id IS NOT NULL THEN is_company_member(company_id)
             ELSE EXISTS (SELECT 1 FROM public.media_items mi
                           WHERE mi.id = media_item_id AND is_company_member(mi.company_id))
        END
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 3: confirm ─────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('media_folders', 'media_items', 'media_categories', 'media_item_categories')
 ORDER BY tablename, policyname;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Only if the gallery breaks and can't wait. This reopens the leak.
--
--   CREATE POLICY "Anyone can manage media_folders" ON public.media_folders FOR ALL USING (true);
--   CREATE POLICY "Anyone can manage media_items" ON public.media_items FOR ALL USING (true);
--   CREATE POLICY "Anyone can manage media_categories" ON public.media_categories FOR ALL USING (true);
--   CREATE POLICY "Anyone can manage media_item_categories" ON public.media_item_categories FOR ALL USING (true);
--   NOTIFY pgrst, 'reload schema';
