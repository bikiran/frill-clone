-- ============================================================
-- COLVY V382 — FORM VERSION HISTORY: THE form_versions TABLE
--
-- The form builder's Versions page and /api/form-versions read and write
-- form_versions, but no file in the repo created it, so on a database set up
-- from the repo the page was always empty and nothing was ever saved. This
-- creates it (or brings a hand-made one up to date) with every column the
-- page and the route use:
--
--   form_versions
--     id                uuid  primary key
--     form_id           uuid  the form (deleted with it)
--     version_number    int   1, 2, 3… per form (unique per form)
--     title             text  ┐
--     description       text  │
--     questions         jsonb │ the form as it was: questions with their logic,
--     theme             jsonb │ theme with the welcome screen settings, logic
--     welcome_message   text  │ variables and list mode, the messages, endings
--     thank_you_message text  │ and display settings
--     end_actions       jsonb │
--     show_confetti     bool  │
--     display_style     text  ┘
--     reason            text  why it was saved: autosave | publish | restore |
--                             before_restore (NULL on older rows)
--     created_by        uuid  who was signed in (NULL if that user is deleted)
--     created_at        timestamptz
--
-- The server keeps the newest 50 versions per form. A version is recorded
-- when the form is published, on save at most every 10 minutes (sooner if
-- questions were removed, changed type or several were added), and around a
-- rollback (lib/form-versions.ts has the rules).
--
-- Access, exactly as V375 sets it for form_versions:
--   • SELECT — staff of the form's workspace (is_company_member) and the
--     platform admin.
--   • INSERT / UPDATE / DELETE — the server only (/api/form-versions, service
--     role). No policy and no privilege for anon / authenticated.
-- Like V375 this drops EVERY policy on the table first (including any made by
-- hand in the dashboard) and creates exactly the one wanted, with the same name
-- and rule V375 uses, so running V375 again afterwards changes nothing.
--
-- If is_company_member() is missing, or is still V209's first version (which
-- counted board visitors as members), the table is created SERVER ONLY (no
-- read policy) and a notice says so: the Versions page reads through
-- /api/form-versions with the service role, so it still works. Run V337 and
-- then this file again to add the member read policy.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- Any time, before or after V375, and before or after the code from branch
-- claude/forms-versions is deployed. That code works without this table: it
-- skips recording versions quietly and the Versions page shows "No version
-- history yet". The first version of each form is recorded on its first save
-- or publish after this runs.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. The last two queries list the columns and the policies: one policy,
--      form_versions_member_read (SELECT, authenticated).
--   2. Open a form, change a question, publish. Versions shows v1 (Published).
--      Roll back to an older version: the builder shows its questions, logic,
--      welcome screen and colour; Versions shows "Before a rollback" and
--      "Rolled back" entries.
--   3. Signed out (anon key):  select * from form_versions;  → permission denied
--      Signed in as staff:     insert into form_versions …  → permission denied
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 0: what this builds on ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.forms') IS NULL THEN
    RAISE EXCEPTION 'public.forms does not exist — run the forms part of DATABASE_SETUP.sql first';
  END IF;
END $$;

-- The platform admin check from V351, repeated so this file stands alone
-- (same body as V351 / V364 / V375).
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

-- ── STEP 1: the table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.form_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id           UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  version_number    INTEGER NOT NULL,
  title             TEXT,
  description       TEXT,
  questions         JSONB NOT NULL DEFAULT '[]'::jsonb,
  theme             JSONB NOT NULL DEFAULT '{}'::jsonb,
  welcome_message   TEXT,
  thank_you_message TEXT,
  end_actions       JSONB,
  show_confetti     BOOLEAN,
  display_style     TEXT,
  reason            TEXT,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A table made by hand in the dashboard (id, form_id, version_number,
-- questions, title, description, theme, created_at): add what it's missing.
-- Nullable here, so existing rows are never rejected.
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS form_id           UUID REFERENCES public.forms(id) ON DELETE CASCADE;
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS version_number    INTEGER;
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS title             TEXT;
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS description       TEXT;
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS questions         JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS theme             JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS welcome_message   TEXT;
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS thank_you_message TEXT;
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS end_actions       JSONB;
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS show_confetti     BOOLEAN;
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS display_style     TEXT;
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS reason            TEXT;
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT now();

-- The route never sends an id: make sure a hand-made uuid id has a default.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'form_versions' AND column_name = 'id'
                AND data_type = 'uuid' AND column_default IS NULL) THEN
    ALTER TABLE public.form_versions ALTER COLUMN id SET DEFAULT gen_random_uuid();
  END IF;
END $$;

-- The old route numbered versions "count + 1", so a hand-made table can hold
-- the same number twice (or none). Renumber just those forms, oldest first,
-- before the unique index below.
WITH bad AS (
  SELECT form_id FROM public.form_versions
   WHERE form_id IS NOT NULL
   GROUP BY form_id
  HAVING count(*) <> count(DISTINCT version_number)
), r AS (
  SELECT v.id, row_number() OVER (PARTITION BY v.form_id ORDER BY v.version_number NULLS FIRST, v.created_at NULLS FIRST, v.id) AS rn
    FROM public.form_versions v JOIN bad USING (form_id)
)
UPDATE public.form_versions v SET version_number = r.rn FROM r WHERE v.id = r.id;

-- One number per form; also serves "newest first" and the 50-version prune.
CREATE UNIQUE INDEX IF NOT EXISTS form_versions_form_number_key
  ON public.form_versions (form_id, version_number);

-- ── STEP 2: access (as V375) ────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  member_ok BOOLEAN;
BEGIN
  ALTER TABLE public.form_versions ENABLE ROW LEVEL SECURITY;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'form_versions' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.form_versions', r.policyname);
    RAISE NOTICE 'dropped % on form_versions', r.policyname;
  END LOOP;
  -- Start from nothing; grant back exactly what the API roles need.
  REVOKE ALL ON public.form_versions FROM anon, authenticated;
  GRANT ALL ON public.form_versions TO service_role;

  -- V337's is_company_member leaves board visitors (role 'viewer') out; V209's
  -- first version didn't, so don't build a read rule on that one.
  member_ok := to_regprocedure('public.is_company_member(uuid)') IS NOT NULL
    AND pg_get_functiondef(to_regprocedure('public.is_company_member(uuid)')) ILIKE '%''viewer''%';
  IF NOT member_ok THEN
    RAISE NOTICE 'is_company_member(uuid) is missing or still counts board visitors — form_versions left server only (run V337, then this file again)';
    RETURN;
  END IF;

  -- The Versions page reads through /api/form-versions; this lets a signed-in
  -- member read their own workspace's versions directly too (same as V375).
  CREATE POLICY form_versions_member_read ON public.form_versions
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.forms f
                    WHERE f.id = form_versions.form_id
                      AND (is_company_member(f.company_id) OR is_platform_admin())));

  GRANT SELECT ON public.form_versions TO authenticated;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 3: check ───────────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'form_versions'
 ORDER BY ordinal_position;

SELECT policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'form_versions';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- The code skips version history quietly without the table, so this is safe.
-- It deletes every saved version.
--
--   DROP TABLE IF EXISTS public.form_versions;
--   NOTIFY pgrst, 'reload schema';
