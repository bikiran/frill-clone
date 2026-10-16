-- ============================================================
-- COLVY V387 — ANNOUNCEMENTS: DRAFTS STAY PRIVATE, ONLY THE BUSINESS EDITS,
-- AND THE NEW EDITOR'S COLUMNS
--
-- DATABASE_SETUP.sql made announcements with
--   "Announcements are viewable by everyone"  SELECT USING (true)
--   "Anyone can insert announcements"         INSERT WITH CHECK (true)
--   "Anyone can update announcements"         UPDATE USING (true)
--   "Anyone can delete announcements"         DELETE USING (true)
-- and no migration has replaced them. None has a TO clause, so with the public
-- key (it ships in the web bundle and the mobile app) anyone could:
--   • read every business's drafts (the public page fetched them all and only
--     hid drafts in the browser);
--   • edit, unpublish or delete any business's posts, or post as them. The
--     updates page rendered the body as HTML without cleaning it, so a
--     stranger could plant a script on any business's board;
--   • set any post's view and reaction counts to anything (the page counted
--     views by writing the row from the browser).
--
-- After this:
--   • SELECT — staff of the post's workspace (is_company_member, which leaves
--     board visitors out since V337): all their posts. The platform admin:
--     everything. Nobody else reads the table directly: the updates page,
--     the chat widget and the email links read through the server
--     (/api/announcements/public, /api/widget-data), which return only live
--     posts of boards that aren't private, and only their public fields. So
--     the public key can't see drafts, private boards' posts, or internal
--     columns (audience, notify results, SMS campaign, who edited it).
--   • INSERT / UPDATE / DELETE — staff of the post's workspace (and the
--     platform admin). An update can't move a post to another workspace.
--     The admin now saves through /api/announcements with the service role,
--     but Settings → "Remove demo data" still deletes from the browser.
--   • Views and reactions are counted by /api/announcements/public through
--     announcement_bump() (server only).
-- It also adds the columns the new editor uses (cover image, video, schedule,
-- end date, button, widget banner/popup, linked roadmap idea, SMS campaign,
-- notify plan and results), and keeps scheduled and ended posts out of Colvy
-- AI's knowledge.
--
-- Like V375 it drops EVERY policy on the table, whatever it's called, then
-- creates exactly the ones wanted, and takes away the table privileges the
-- API roles don't need.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- AFTER the code from branch claude/announcements is deployed. That code works
-- before and after this runs (missing columns are left out of saves and the
-- admin says scheduling etc. are waiting on this update); the code before it
-- does not all work after (the old public page wrote views from the browser).
-- Needs is_company_member() from V209 as changed by V337; stops with an error,
-- changing nothing, if that's missing or still the original.
-- The mobile app (colvy-mobile app/announcements.tsx) only reads; it keeps
-- working: as signed-in staff it now sees only its own workspace's posts
-- (before, every business's).
-- DATABASE_SETUP.sql still creates the old open policies by name; if it is
-- ever re-run, run this file again.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. Step 7 lists the policies (four, none USING (true)).
--   2. Signed out (anon key):
--        select * from announcements;                                  → permission denied
--        update announcements set views = 999;                         → permission denied
--        insert into announcements (title) values ('x');               → permission denied
--   3. As an agent (not the owner): Announcements lists drafts, scheduled and
--      published posts; create, edit, schedule, pin, duplicate, delete work.
--   4. A scheduled post goes live within five minutes of its time
--      (/api/cron/announcements) and shows on the updates page and widget.
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 0: what this builds on ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.announcements') IS NULL THEN
    RAISE EXCEPTION 'announcements does not exist — run DATABASE_SETUP.sql first';
  END IF;
  IF to_regprocedure('public.is_company_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'is_company_member(uuid) is missing — run COLVY_V209_RLS_PHASE1_CREDENTIALS.sql and COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql first';
  END IF;
  IF pg_get_functiondef(to_regprocedure('public.is_company_member(uuid)')) NOT ILIKE '%''viewer''%' THEN
    RAISE EXCEPTION 'is_company_member(uuid) still counts board visitors (role viewer) as members — run COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql first';
  END IF;
END $$;

-- Same body as V351 / V364 / V375, so this file stands alone.
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

-- ── STEP 1: columns ─────────────────────────────────────────────────────────
-- Ones older files add (repeated so this stands alone) …
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS views INT DEFAULT 0;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS impressions INT DEFAULT 0;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS location_ids UUID[];
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS segmentation TEXT DEFAULT 'all';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS notify_subscribers BOOLEAN DEFAULT true;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS boost_title TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS boost_blurb TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS boost_button_label TEXT DEFAULT 'Learn More';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS boost_image TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
-- … and the new ones.
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS cover_image TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ;   -- when it went (or goes) live
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;   -- end of a sale / event: hidden after
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS cta_label TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS cta_url TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS boost_enabled BOOLEAN DEFAULT FALSE;  -- show in the chat widget
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS boost_type TEXT DEFAULT 'banner';     -- banner | popup
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS idea_id UUID;            -- the roadmap idea it delivers
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS sms_campaign_id UUID;    -- draft SMS campaign made from it
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS notify_stats JSONB;      -- { plan: {board,email}, board, email, skipped, at }
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS updated_by UUID;

-- Legacy rows with no status were public (V96 did the same).
UPDATE announcements SET status = 'published' WHERE status IS NULL;
UPDATE announcements SET reactions = '{}'::jsonb WHERE reactions IS NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_company_created ON announcements (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_scheduled ON announcements (publish_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_announcements_expires ON announcements (expires_at) WHERE expires_at IS NOT NULL;

-- ── STEP 2: is a post live right now? ───────────────────────────────────────
CREATE OR REPLACE FUNCTION announcement_is_live(p_status TEXT, p_publish_at TIMESTAMPTZ, p_expires_at TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (coalesce(p_status, 'published') = 'published' AND (p_publish_at IS NULL OR p_publish_at <= now())
          OR coalesce(p_status, '') = 'scheduled' AND p_publish_at IS NOT NULL AND p_publish_at <= now())
     AND (p_expires_at IS NULL OR p_expires_at > now())
$$;
REVOKE ALL ON FUNCTION announcement_is_live(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION announcement_is_live(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated, service_role;

-- ── STEP 3: what is about to be dropped ─────────────────────────────────────
SELECT policyname, cmd, roles, qual, with_check
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'announcements' ORDER BY policyname;

-- ── STEP 4: policies ────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'announcements' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.announcements', r.policyname);
    RAISE NOTICE 'dropped % on announcements', r.policyname;
  END LOOP;
  REVOKE ALL ON public.announcements FROM anon, authenticated;
  GRANT ALL ON public.announcements TO service_role;

  -- No read policy for the public: see the header. (The mobile app reads as
  -- signed-in staff, below.)
  CREATE POLICY announcements_member_read ON public.announcements
    FOR SELECT TO authenticated
    USING (is_company_member(company_id) OR is_platform_admin());

  CREATE POLICY announcements_member_insert ON public.announcements
    FOR INSERT TO authenticated
    WITH CHECK (company_id IS NOT NULL AND (is_company_member(company_id) OR is_platform_admin()));

  CREATE POLICY announcements_member_update ON public.announcements
    FOR UPDATE TO authenticated
    USING (is_company_member(company_id) OR is_platform_admin())
    WITH CHECK (company_id IS NOT NULL AND (is_company_member(company_id) OR is_platform_admin()));

  CREATE POLICY announcements_member_delete ON public.announcements
    FOR DELETE TO authenticated
    USING (is_company_member(company_id) OR is_platform_admin());

  GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
END $$;

-- ── STEP 5: counters (server only) ──────────────────────────────────────────
-- One atomic add to views / impressions or one reaction, never below zero.
CREATE OR REPLACE FUNCTION announcement_bump(p_id UUID, p_field TEXT, p_key TEXT, p_delta INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_delta NOT BETWEEN -1 AND 1 THEN RAISE EXCEPTION 'bad delta'; END IF;
  IF p_field = 'views' THEN
    UPDATE announcements SET views = greatest(0, coalesce(views, 0) + p_delta) WHERE id = p_id;
  ELSIF p_field = 'impressions' THEN
    UPDATE announcements SET impressions = greatest(0, coalesce(impressions, 0) + p_delta) WHERE id = p_id;
  ELSIF p_field = 'reaction' AND p_key IN ('like', 'love', 'celebrate', 'interested') THEN
    UPDATE announcements
       SET reactions = jsonb_set(coalesce(reactions, '{}'::jsonb), ARRAY[p_key],
             to_jsonb(greatest(0, coalesce((reactions ->> p_key)::int, 0) + p_delta)), true)
     WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'bad field';
  END IF;
END $$;
REVOKE ALL ON FUNCTION announcement_bump(UUID, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION announcement_bump(UUID, TEXT, TEXT, INT) TO service_role;

-- ── STEP 6: Colvy AI's knowledge — live posts only ──────────────────────────
-- V326's trigger copied any 'published' post. Now: live posts only, and it
-- also reacts to the schedule and end date changing. (The cron removes posts
-- whose end date passes, since no row changes then.) Skipped if V326 hasn't run.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ai_kn_put') OR to_regclass('public.ai_knowledge') IS NULL THEN
    RAISE NOTICE 'AI knowledge (V326) not installed — step 6 skipped';
    RETURN;
  END IF;
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION ai_kn_sync_announcement() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $b$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        DELETE FROM ai_knowledge WHERE company_id = OLD.company_id AND source = 'announcement' AND source_id = OLD.id::text;
        RETURN OLD;
      END IF;
      IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
      IF announcement_is_live(NEW.status, NEW.publish_at, NEW.expires_at) AND ai_kn_enabled(NEW.company_id, 'announcements') THEN
        PERFORM ai_kn_put(NEW.company_id, 'announcement', NEW.id::text, NEW.title,
          left(NEW.title || E'\n' || ai_kn_strip(NEW.description), 12000));
      ELSE
        DELETE FROM ai_knowledge WHERE company_id = NEW.company_id AND source = 'announcement' AND source_id = NEW.id::text;
      END IF;
      RETURN NEW;
    END $b$;
  $f$;
  DROP TRIGGER IF EXISTS trg_ai_kn_announcement ON announcements;
  CREATE TRIGGER trg_ai_kn_announcement AFTER INSERT OR DELETE OR UPDATE OF title, description, status, company_id, publish_at, expires_at ON announcements
    FOR EACH ROW EXECUTE FUNCTION ai_kn_sync_announcement();
  -- Anything there now that isn't live goes.
  DELETE FROM ai_knowledge k USING announcements a
   WHERE k.source = 'announcement' AND k.source_id = a.id::text
     AND NOT announcement_is_live(a.status, a.publish_at, a.expires_at);
END $$;

-- ── STEP 7: check ───────────────────────────────────────────────────────────
SELECT policyname, cmd, roles, qual, with_check
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'announcements' ORDER BY policyname;
-- Must return no rows:
SELECT policyname FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'announcements' AND (qual IS NULL OR btrim(qual) = 'true') AND cmd <> 'INSERT';

NOTIFY pgrst, 'reload schema';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Puts the OLD (open) policies back. Only if something is badly broken; it
-- reopens the hole described at the top. The columns can stay (the code uses
-- them when present); drop them only after rolling the code back too.
--
--   DO $$ DECLARE r RECORD; BEGIN
--     FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='announcements' LOOP
--       EXECUTE format('DROP POLICY IF EXISTS %I ON public.announcements', r.policyname);
--     END LOOP;
--   END $$;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO anon, authenticated;
--   CREATE POLICY "Announcements are viewable by everyone" ON announcements FOR SELECT USING (true);
--   CREATE POLICY "Anyone can insert announcements" ON announcements FOR INSERT WITH CHECK (true);
--   CREATE POLICY "Anyone can update announcements" ON announcements FOR UPDATE USING (true);
--   CREATE POLICY "Anyone can delete announcements" ON announcements FOR DELETE USING (true);
--   DROP FUNCTION IF EXISTS announcement_bump(UUID, TEXT, TEXT, INT);
--   -- AI knowledge trigger back to V326's (only if V326 is installed; skip these three lines otherwise):
--   DROP TRIGGER IF EXISTS trg_ai_kn_announcement ON announcements;
--   CREATE OR REPLACE FUNCTION ai_kn_sync_announcement() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $b$ BEGIN IF TG_OP = 'DELETE' THEN DELETE FROM ai_knowledge WHERE company_id = OLD.company_id AND source = 'announcement' AND source_id = OLD.id::text; RETURN OLD; END IF; IF NEW.company_id IS NULL THEN RETURN NEW; END IF; IF coalesce(NEW.status, 'published') = 'published' AND ai_kn_enabled(NEW.company_id, 'announcements') THEN PERFORM ai_kn_put(NEW.company_id, 'announcement', NEW.id::text, NEW.title, left(NEW.title || E'\n' || ai_kn_strip(NEW.description), 12000)); ELSE DELETE FROM ai_knowledge WHERE company_id = NEW.company_id AND source = 'announcement' AND source_id = NEW.id::text; END IF; RETURN NEW; END $b$;
--   CREATE TRIGGER trg_ai_kn_announcement AFTER INSERT OR DELETE OR UPDATE OF title, description, status, company_id ON announcements FOR EACH ROW EXECUTE FUNCTION ai_kn_sync_announcement();
--   -- Columns (only with the old code back):
--   ALTER TABLE announcements DROP COLUMN IF EXISTS cover_image, DROP COLUMN IF EXISTS video_url,
--     DROP COLUMN IF EXISTS publish_at, DROP COLUMN IF EXISTS expires_at, DROP COLUMN IF EXISTS cta_label,
--     DROP COLUMN IF EXISTS cta_url, DROP COLUMN IF EXISTS idea_id, DROP COLUMN IF EXISTS language,
--     DROP COLUMN IF EXISTS sms_campaign_id, DROP COLUMN IF EXISTS notify_stats, DROP COLUMN IF EXISTS updated_by;
--   DROP FUNCTION IF EXISTS announcement_is_live(TEXT, TIMESTAMPTZ, TIMESTAMPTZ);  -- after the policies are gone
