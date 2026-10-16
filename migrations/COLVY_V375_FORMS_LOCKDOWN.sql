-- ============================================================
-- COLVY V375 — FORMS: STRANGERS SEE PUBLISHED FORMS, ONLY THE BUSINESS SEES ITS RESPONSES
--
-- DATABASE_SETUP.sql created the forms feature with these, and no migration
-- has removed them:
--   forms           "Anyone can read published forms"      SELECT USING (true)
--   forms           "Authenticated users can manage forms" ALL    USING (true)
--   form_responses  "Anyone can submit form responses"     INSERT WITH CHECK (true)
--   form_responses  "Form owners can read responses"       SELECT USING (true)
-- None has a TO clause, so all of them apply to PUBLIC, anon included. Despite
-- the names, anyone holding the public key (it ships in the web bundle and
-- the mobile app) could:
--   • read every business's draft forms;
--   • edit, unpublish, move or delete any business's form, or make new ones;
--   • read every response to every form: names, emails, phone numbers,
--     answers, uploaded-file links, IP / browser details.
-- V316 gave the embeddable contact forms the same shape ("manage contact_forms"
-- and "manage contact_form_submissions", FOR ALL USING (true)), so every
-- website enquiry was readable and editable by anyone too.
--
-- After this:
--   forms
--     • SELECT — published forms for everyone (the public form page, the
--       chat widget's Forms tab); every form of a workspace you're staff in
--       (is_company_member); and the platform admin.
--     • INSERT / UPDATE / DELETE — staff of the form's workspace only. An
--       update can't move a form to another workspace.
--   form_responses
--     • INSERT — anyone, signed in or not, but only into a published form.
--     • SELECT — staff of the form's workspace, and the platform admin.
--     • UPDATE / DELETE — the server only (Results → delete goes through
--       /api/forms/responses with the service role).
--   form_versions (if the table exists — it isn't created by any file in the
--   repo, the Versions page reads it)
--     • SELECT — staff of the form's workspace, and the platform admin.
--     • writes — the server only (/api/form-versions).
--   form_notifications (if it exists) — the server only, both ways.
--   contact_forms
--     • SELECT — active forms for everyone (the embeddable /f/<id> page);
--       every form for its workspace's staff; the platform admin.
--     • INSERT / UPDATE / DELETE — the workspace's staff.
--   contact_form_submissions
--     • SELECT — the workspace's staff, and the platform admin.
--     • writes — the server only (/api/contact-form/submit).
--   The service role (every server route) bypasses RLS and is unaffected.
--
-- Board visitors (team role 'viewer') are not staff: is_company_member, as V337
-- left it, leaves them out — they get the same as a stranger.
--
-- Like V351 / V361 / V364 this doesn't guess policy names: it drops EVERY
-- policy on each table, whatever it's called (including any made by hand in
-- the dashboard), then creates exactly the ones wanted. It also takes away
-- the table privileges the API roles don't need, so an old script that adds a
-- permissive policy back still can't reopen writes.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- AFTER the code from branch claude/forms-lockdown is deployed. That code
-- works both before and after this runs; the code before it does not all work
-- after: the chat widget showed forms sent into a chat by reading the table
-- with the public key, which fails for a form that isn't published. It now
-- goes through /api/widget/form.
-- Needs is_company_member() from V209 (as changed by V337); it stops with an
-- error, changing nothing, if that function is missing.
-- The mobile app (colvy-mobile) doesn't read or write any of these tables, so
-- it needs no change.
-- DATABASE_SETUP.sql and V316 still create the old open policies by name (as
-- they do for team_members); if either is ever re-run, run this file again.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. Step 8 lists the policies; step 9 must return no rows; step 10 lists
--      forms with no workspace (nobody but the server can manage those —
--      assign a company_id if any are real).
--   2. Signed out, open a published form at /forms/<id>, scan a business card,
--      fill it in (with a payment / booking question if you have one) and
--      submit. The owner gets the "new response" email; integrations fire.
--   3. As an agent (not the owner): Forms lists the workspace's forms with
--      response counts; create, edit (autosave), publish / unpublish,
--      duplicate and delete a form; Results shows and deletes responses;
--      Versions lists and restores.
--   4. In the inbox, send a DRAFT form into a live chat; the visitor sees and
--      submits it in the widget.
--   5. Signed out (anon key):
--        select * from forms where is_published = false;  → no rows
--        select * from form_responses;                     → permission denied
--        update forms set title = 'x';                     → permission denied
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 0: what this builds on ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.is_company_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'is_company_member(uuid) is missing — run COLVY_V209_RLS_PHASE1_CREDENTIALS.sql and COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql first';
  END IF;
END $$;

-- The platform admin check from V351, repeated so this file stands alone
-- (same body as V351 / V364). anon can't execute it, so it only appears in
-- policies for authenticated.
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

-- Switches RLS on and drops every policy on a table. False if the table
-- doesn't exist here (form_versions / form_notifications / the contact-form
-- tables may not), so the caller skips it.
CREATE OR REPLACE FUNCTION pg_temp.colvy_v375_reset(t TEXT)
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
  -- Start from nothing; each step grants back exactly what the API roles need.
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  RETURN true;
END $$;

-- ── STEP 1: what is about to be dropped ─────────────────────────────────────
SELECT tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('forms', 'form_responses', 'form_versions', 'form_notifications',
                     'contact_forms', 'contact_form_submissions')
 ORDER BY tablename, policyname;

-- ── STEP 2: forms ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT pg_temp.colvy_v375_reset('forms') THEN RETURN; END IF;

  -- The public form page (/forms/<id>) and the widget's Forms tab.
  CREATE POLICY forms_public_read ON public.forms
    FOR SELECT TO anon, authenticated
    USING (is_published IS TRUE);

  -- Builder, Forms list, Results, Versions, the inbox's form picker and
  -- Conversation Actions all read as the signed-in member. The platform admin
  -- can look at any workspace's forms.
  CREATE POLICY forms_member_read ON public.forms
    FOR SELECT TO authenticated
    USING (is_company_member(company_id) OR is_platform_admin());

  CREATE POLICY forms_member_insert ON public.forms
    FOR INSERT TO authenticated
    WITH CHECK (is_company_member(company_id));

  -- WITH CHECK as well, so a form can't be handed to another workspace.
  CREATE POLICY forms_member_update ON public.forms
    FOR UPDATE TO authenticated
    USING (is_company_member(company_id))
    WITH CHECK (is_company_member(company_id));

  CREATE POLICY forms_member_delete ON public.forms
    FOR DELETE TO authenticated
    USING (is_company_member(company_id));

  GRANT SELECT ON public.forms TO anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.forms TO authenticated;
END $$;

-- ── STEP 3: form_responses ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT pg_temp.colvy_v375_reset('form_responses') THEN RETURN; END IF;

  -- Anyone may answer a published form. The sub-select runs as the caller, so
  -- for a stranger it can only ever see published forms anyway; the explicit
  -- is_published keeps a member from filing responses into their own drafts.
  -- created_at must be real (the default, now): a response dated in the
  -- future — or with none — would sort as "newest" for good and swallow the
  -- notification / integration events of every real response after it.
  CREATE POLICY form_responses_public_insert ON public.form_responses
    FOR INSERT TO anon, authenticated
    WITH CHECK (
      form_id IS NOT NULL
      AND created_at <= now() + interval '5 minutes'
      AND EXISTS (SELECT 1 FROM public.forms f
                   WHERE f.id = form_responses.form_id AND f.is_published IS TRUE)
    );

  -- Results, the Forms list's counts: staff of the form's workspace, and the
  -- platform admin. Nothing else — not even the person who submitted.
  CREATE POLICY form_responses_member_read ON public.form_responses
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.forms f
                    WHERE f.id = form_responses.form_id
                      AND (is_company_member(f.company_id) OR is_platform_admin())));

  -- No UPDATE / DELETE policy or privilege: the server (service role) only.
  -- Table-wide INSERT rather than per column, so a column added later (the
  -- form logic work stores more with each response) doesn't break submitting.
  GRANT INSERT ON public.form_responses TO anon;
  GRANT SELECT, INSERT ON public.form_responses TO authenticated;
END $$;

-- Results and the list's counts read one form's responses newest first.
DO $$
BEGIN
  IF to_regclass('public.form_responses') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS form_responses_form_created_idx
      ON public.form_responses (form_id, created_at DESC);
  END IF;
END $$;

-- ── STEP 4: form_versions (only if it exists) ───────────────────────────────
DO $$
BEGIN
  IF NOT pg_temp.colvy_v375_reset('form_versions') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'form_versions' AND column_name = 'form_id') THEN
    RAISE NOTICE 'form_versions has no form_id column — left server only';
    RETURN;
  END IF;

  -- The Versions page reads as the signed-in member; snapshots and restores
  -- are written by /api/form-versions with the service role.
  CREATE POLICY form_versions_member_read ON public.form_versions
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.forms f
                    WHERE f.id = form_versions.form_id
                      AND (is_company_member(f.company_id) OR is_platform_admin())));

  GRANT SELECT ON public.form_versions TO authenticated;
END $$;

-- ── STEP 5: form_notifications (only if it exists) ──────────────────────────
-- Written by /api/form-notifications, read by nothing. Server only: no policy,
-- no privilege for the API roles.
DO $$
BEGIN
  PERFORM pg_temp.colvy_v375_reset('form_notifications');
END $$;

-- ── STEP 6: contact_forms (V316) ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT pg_temp.colvy_v375_reset('contact_forms') THEN RETURN; END IF;

  -- The embeddable /f/<id> page reads the form with the public key.
  CREATE POLICY contact_forms_public_read ON public.contact_forms
    FOR SELECT TO anon, authenticated
    USING (is_active IS NOT FALSE);

  -- Settings → Contact Form (list, editor, preview of a paused form).
  CREATE POLICY contact_forms_member_read ON public.contact_forms
    FOR SELECT TO authenticated
    USING (is_company_member(company_id) OR is_platform_admin());

  CREATE POLICY contact_forms_member_insert ON public.contact_forms
    FOR INSERT TO authenticated
    WITH CHECK (is_company_member(company_id));

  CREATE POLICY contact_forms_member_update ON public.contact_forms
    FOR UPDATE TO authenticated
    USING (is_company_member(company_id))
    WITH CHECK (is_company_member(company_id));

  CREATE POLICY contact_forms_member_delete ON public.contact_forms
    FOR DELETE TO authenticated
    USING (is_company_member(company_id));

  GRANT SELECT ON public.contact_forms TO anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_forms TO authenticated;
END $$;

-- ── STEP 7: contact_form_submissions (V316) ─────────────────────────────────
DO $$
BEGIN
  IF NOT pg_temp.colvy_v375_reset('contact_form_submissions') THEN RETURN; END IF;

  -- Submissions arrive through /api/contact-form/submit and the customer
  -- timeline reads them, both with the service role. Staff may read their own.
  CREATE POLICY contact_form_submissions_member_read ON public.contact_form_submissions
    FOR SELECT TO authenticated
    USING (is_company_member(company_id) OR is_platform_admin());

  GRANT SELECT ON public.contact_form_submissions TO authenticated;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 8: confirm ─────────────────────────────────────────────────────────
-- Expect: forms — forms_public_read (SELECT {anon,authenticated}),
-- forms_member_read / _insert / _update / _delete ({authenticated});
-- form_responses — form_responses_public_insert (INSERT {anon,authenticated}),
-- form_responses_member_read (SELECT); form_versions_member_read (SELECT);
-- form_notifications — none; contact_forms — like forms;
-- contact_form_submissions_member_read (SELECT).
SELECT tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('forms', 'form_responses', 'form_versions', 'form_notifications',
                     'contact_forms', 'contact_form_submissions')
 ORDER BY tablename, policyname;

-- ── STEP 9: privileges the API roles shouldn't have ─────────────────────────
-- Should return no rows.
SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee IN ('anon', 'authenticated')
   AND (
        (table_name IN ('forms', 'contact_forms') AND grantee = 'anon' AND privilege_type <> 'SELECT')
     OR (table_name IN ('forms', 'contact_forms') AND privilege_type NOT IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
     OR (table_name = 'form_responses' AND privilege_type NOT IN ('INSERT', 'SELECT'))
     OR (table_name = 'form_responses' AND grantee = 'anon' AND privilege_type <> 'INSERT')
     OR (table_name IN ('form_versions', 'contact_form_submissions') AND privilege_type <> 'SELECT')
     OR (table_name IN ('form_versions', 'contact_form_submissions') AND grantee = 'anon')
     OR (table_name = 'form_notifications')
   );

-- ── STEP 10: forms that belong to no workspace ──────────────────────────────
-- The old Forms page saved company_id = NULL when someone other than the owner
-- created a form. Only the server can see or manage those now. Give real ones
-- a company_id:  update forms set company_id = '<company id>' where id = '<form id>';
SELECT id, title, is_published, created_at
  FROM public.forms
 WHERE company_id IS NULL
 ORDER BY created_at DESC;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Only if forms stop working for staff and it can't wait for a fix. This
-- reopens exactly the hole closed above (anyone can read every response and
-- edit any form) — a stopgap only. The code from claude/forms-lockdown keeps
-- working either way, so it doesn't need rolling back with it.
--
--   DROP POLICY IF EXISTS forms_public_read ON public.forms;
--   DROP POLICY IF EXISTS forms_member_read ON public.forms;
--   DROP POLICY IF EXISTS forms_member_insert ON public.forms;
--   DROP POLICY IF EXISTS forms_member_update ON public.forms;
--   DROP POLICY IF EXISTS forms_member_delete ON public.forms;
--   CREATE POLICY "Anyone can read published forms" ON public.forms FOR SELECT USING (true);
--   CREATE POLICY "Authenticated users can manage forms" ON public.forms FOR ALL USING (true);
--   GRANT ALL ON public.forms TO anon, authenticated;
--
--   DROP POLICY IF EXISTS form_responses_public_insert ON public.form_responses;
--   DROP POLICY IF EXISTS form_responses_member_read ON public.form_responses;
--   CREATE POLICY "Anyone can submit form responses" ON public.form_responses FOR INSERT WITH CHECK (true);
--   CREATE POLICY "Form owners can read responses" ON public.form_responses FOR SELECT USING (true);
--   GRANT ALL ON public.form_responses TO anon, authenticated;
--
--   -- form_versions / form_notifications, if they exist (they had no known policies):
--   GRANT ALL ON public.form_versions TO anon, authenticated;
--   GRANT ALL ON public.form_notifications TO anon, authenticated;
--   ALTER TABLE public.form_versions DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.form_notifications DISABLE ROW LEVEL SECURITY;
--
--   DROP POLICY IF EXISTS contact_forms_public_read ON public.contact_forms;
--   DROP POLICY IF EXISTS contact_forms_member_read ON public.contact_forms;
--   DROP POLICY IF EXISTS contact_forms_member_insert ON public.contact_forms;
--   DROP POLICY IF EXISTS contact_forms_member_update ON public.contact_forms;
--   DROP POLICY IF EXISTS contact_forms_member_delete ON public.contact_forms;
--   CREATE POLICY "manage contact_forms" ON public.contact_forms FOR ALL USING (true) WITH CHECK (true);
--   GRANT ALL ON public.contact_forms TO anon, authenticated;
--   DROP POLICY IF EXISTS contact_form_submissions_member_read ON public.contact_form_submissions;
--   CREATE POLICY "manage contact_form_submissions" ON public.contact_form_submissions FOR ALL USING (true) WITH CHECK (true);
--   GRANT ALL ON public.contact_form_submissions TO anon, authenticated;
--   NOTIFY pgrst, 'reload schema';
