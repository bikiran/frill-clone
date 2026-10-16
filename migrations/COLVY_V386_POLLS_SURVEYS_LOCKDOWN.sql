-- ============================================================
-- COLVY V386 — POLLS & SURVEYS: STRANGERS SEE LIVE ONES, ONLY THE BUSINESS SEES THE ANSWERS
--
-- DATABASE_SETUP.sql created polls and surveys with these, and no migration
-- has removed them:
--   polls             "Polls are viewable by everyone"               SELECT USING (true)
--   polls             "Anyone can manage polls"                      ALL    USING (true)
--   poll_votes        "Poll votes are viewable by everyone"          SELECT USING (true)
--   poll_votes        "Anyone can vote in polls"                     INSERT WITH CHECK (true)
--   surveys           "Surveys are viewable by everyone"             SELECT USING (true)
--   surveys           "Anyone can manage surveys"                    ALL    USING (true)
--   survey_responses  "Survey responses are viewable by everyone"    SELECT USING (true)
--   survey_responses  "Anyone can submit responses"                  INSERT WITH CHECK (true)
-- None has a TO clause, so they apply to anon too. Anyone holding the public
-- key (it ships in the web bundle) could edit, close, move or delete any
-- business's polls and surveys, read every vote and every survey comment, and
-- stuff votes without limit (the public pages only remembered a vote in
-- localStorage).
--
-- After this:
--   polls / surveys
--     • SELECT — live ones for everyone (is_active not false and status not
--       'draft' / 'closed'): the chat widget's in-chat poll card reads them
--       with the public key. Every row of a workspace for its staff
--       (is_company_member), and the platform admin.
--     • INSERT / UPDATE / DELETE — staff of the row's workspace only; an
--       update can't move a row to another workspace.
--   poll_votes / survey_responses
--     • SELECT — staff of the poll's / survey's workspace, and the platform admin.
--     • INSERT / UPDATE / DELETE — the server only. Votes and responses now go
--       through /api/polls/<id>/vote and /api/surveys/<id>/respond (one per
--       person, rate limited, closed and draft items refused); Results →
--       delete goes through /api/engage/responses. The public pages read
--       totals from /api/polls/<id>, never the rows.
--   The service role (every server route) bypasses RLS and is unaffected.
--
-- It also adds the columns the new builder, results and dedupe use. All are
-- optional: the code from claude/polls-surveys works without them (no close
-- date, vote changes or per-person dedupe beyond a cookie until this runs).
--   polls.settings / surveys.settings  JSONB — close date, results visibility,
--       vote changes, ask for name / contact, thank-you text, notifications,
--       CSAT scale. (One column so a new setting never needs a migration.)
--   polls.updated_at / surveys.updated_at, surveys.description
--   poll_votes:       option (text, if missing), voter_key, contact_id, respondent, rank, ip_hash;
--                     option_index (DATABASE_SETUP's NOT NULL) may be empty, as every vote since stores the text
--   survey_responses: answer, comment (if missing), answers, voter_key, contact_id, respondent, ip_hash
--     voter_key  — a random id kept in the voter's browser (cookie), so one
--                  person gets one vote (and can change it when allowed).
--     ip_hash    — a salted hash of the IP, per poll, only to cap how many votes
--                  one connection can send. The IP itself is never stored.
--
-- Like V375 this doesn't guess policy names: it drops EVERY policy on each
-- table (including any made by hand in the dashboard), then creates exactly
-- the ones wanted, and takes away table privileges the API roles don't need.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- AFTER the code from branch claude/polls-surveys is deployed. That code works
-- both before and after this runs. The code before it does not: its public
-- poll and survey pages wrote votes and read results with the public key.
-- Needs is_company_member() from V209 as changed by V337 (stops with an error,
-- changing nothing, if it's missing or still counts board visitors).
-- The mobile app (colvy-mobile) doesn't read or write these tables.
-- DATABASE_SETUP.sql still creates the old open policies by name; if it is
-- ever re-run, run this file again.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. Step 7 lists the policies; step 8 must return no rows; step 9 lists
--      polls / surveys with no workspace (only the server can manage those).
--   2. Signed out, open a live poll at /polls/<id>, vote, reload: it shows your
--      vote and the results. Open it in another browser on the same network
--      and vote again: allowed (a different person). Open a live survey at
--      /surveys/<id> and answer it.
--   3. As an agent (not the owner): Polls and Surveys list the workspace's
--      items with counts; create, edit, close / reopen, duplicate and delete;
--      Results shows votes / responses; delete a response; export CSV.
--   4. Signed out (anon key):
--        select * from poll_votes;                       → permission denied
--        select * from survey_responses;                 → permission denied
--        select * from polls where status = 'draft';     → no rows
--        update polls set question = 'x';                → permission denied
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

-- RLS on, every policy dropped, API-role privileges taken away. False (and
-- nothing done) if the table doesn't exist here.
CREATE OR REPLACE FUNCTION pg_temp.colvy_v386_reset(t TEXT)
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

-- ── STEP 1: what is about to be dropped ─────────────────────────────────────
SELECT tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('polls', 'poll_votes', 'surveys', 'survey_responses')
 ORDER BY tablename, policyname;

-- ── STEP 2: columns ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.polls') IS NOT NULL THEN
    ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
    ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS image_url TEXT;
    ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS poll_type TEXT DEFAULT 'single_choice';
    ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
    ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
    CREATE INDEX IF NOT EXISTS idx_polls_company ON public.polls (company_id);
  END IF;
  IF to_regclass('public.surveys') IS NOT NULL THEN
    ALTER TABLE public.surveys ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
    ALTER TABLE public.surveys ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE public.surveys ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
    ALTER TABLE public.surveys ADD COLUMN IF NOT EXISTS questions JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE public.surveys ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE public.surveys ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
    CREATE INDEX IF NOT EXISTS idx_surveys_company ON public.surveys (company_id);
  END IF;
  IF to_regclass('public.poll_votes') IS NOT NULL THEN
    ALTER TABLE public.poll_votes ADD COLUMN IF NOT EXISTS option TEXT;
    ALTER TABLE public.poll_votes ADD COLUMN IF NOT EXISTS voter_key TEXT;
    ALTER TABLE public.poll_votes ADD COLUMN IF NOT EXISTS contact_id UUID;
    ALTER TABLE public.poll_votes ADD COLUMN IF NOT EXISTS respondent JSONB;
    ALTER TABLE public.poll_votes ADD COLUMN IF NOT EXISTS rank INT;
    ALTER TABLE public.poll_votes ADD COLUMN IF NOT EXISTS ip_hash TEXT;
    -- DATABASE_SETUP.sql made option_index NOT NULL; every vote since stores
    -- the option's text instead, so it must be allowed to be empty.
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'poll_votes' AND column_name = 'option_index' AND is_nullable = 'NO') THEN
      ALTER TABLE public.poll_votes ALTER COLUMN option_index DROP NOT NULL;
    END IF;
    CREATE INDEX IF NOT EXISTS poll_votes_poll_created_idx ON public.poll_votes (poll_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS poll_votes_poll_voter_idx ON public.poll_votes (poll_id, voter_key) WHERE voter_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS poll_votes_poll_ip_idx ON public.poll_votes (poll_id, ip_hash, created_at) WHERE ip_hash IS NOT NULL;
  END IF;
  IF to_regclass('public.survey_responses') IS NOT NULL THEN
    ALTER TABLE public.survey_responses ADD COLUMN IF NOT EXISTS answer TEXT;
    ALTER TABLE public.survey_responses ADD COLUMN IF NOT EXISTS comment TEXT;
    ALTER TABLE public.survey_responses ADD COLUMN IF NOT EXISTS answers JSONB;
    ALTER TABLE public.survey_responses ADD COLUMN IF NOT EXISTS voter_key TEXT;
    ALTER TABLE public.survey_responses ADD COLUMN IF NOT EXISTS contact_id UUID;
    ALTER TABLE public.survey_responses ADD COLUMN IF NOT EXISTS respondent JSONB;
    ALTER TABLE public.survey_responses ADD COLUMN IF NOT EXISTS ip_hash TEXT;
    CREATE INDEX IF NOT EXISTS survey_responses_survey_created_idx ON public.survey_responses (survey_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS survey_responses_survey_voter_idx ON public.survey_responses (survey_id, voter_key) WHERE voter_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS survey_responses_survey_ip_idx ON public.survey_responses (survey_id, ip_hash, created_at) WHERE ip_hash IS NOT NULL;
  END IF;
END $$;

-- ── STEP 3: polls ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT pg_temp.colvy_v386_reset('polls') THEN RETURN; END IF;

  -- Live polls: the chat widget's in-chat poll card. Drafts and closed polls
  -- reach the public only through /api/polls/<id>, which decides what to show.
  CREATE POLICY polls_public_read ON public.polls
    FOR SELECT TO anon, authenticated
    USING (is_active IS NOT FALSE AND COALESCE(status, 'active') NOT IN ('draft', 'closed'));

  CREATE POLICY polls_member_read ON public.polls
    FOR SELECT TO authenticated
    USING (is_company_member(company_id) OR is_platform_admin());

  CREATE POLICY polls_member_insert ON public.polls
    FOR INSERT TO authenticated
    WITH CHECK (is_company_member(company_id));

  CREATE POLICY polls_member_update ON public.polls
    FOR UPDATE TO authenticated
    USING (is_company_member(company_id))
    WITH CHECK (is_company_member(company_id));

  CREATE POLICY polls_member_delete ON public.polls
    FOR DELETE TO authenticated
    USING (is_company_member(company_id));

  GRANT SELECT ON public.polls TO anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.polls TO authenticated;
END $$;

-- ── STEP 4: surveys ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT pg_temp.colvy_v386_reset('surveys') THEN RETURN; END IF;

  CREATE POLICY surveys_public_read ON public.surveys
    FOR SELECT TO anon, authenticated
    USING (is_active IS NOT FALSE AND COALESCE(status, 'active') NOT IN ('draft', 'closed'));

  CREATE POLICY surveys_member_read ON public.surveys
    FOR SELECT TO authenticated
    USING (is_company_member(company_id) OR is_platform_admin());

  CREATE POLICY surveys_member_insert ON public.surveys
    FOR INSERT TO authenticated
    WITH CHECK (is_company_member(company_id));

  CREATE POLICY surveys_member_update ON public.surveys
    FOR UPDATE TO authenticated
    USING (is_company_member(company_id))
    WITH CHECK (is_company_member(company_id));

  CREATE POLICY surveys_member_delete ON public.surveys
    FOR DELETE TO authenticated
    USING (is_company_member(company_id));

  GRANT SELECT ON public.surveys TO anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.surveys TO authenticated;
END $$;

-- ── STEP 5: poll_votes ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT pg_temp.colvy_v386_reset('poll_votes') THEN RETURN; END IF;

  -- Results and the list's counts. Writes: the server only (no policy, no grant).
  CREATE POLICY poll_votes_member_read ON public.poll_votes
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.polls p
                    WHERE p.id = poll_votes.poll_id
                      AND (is_company_member(p.company_id) OR is_platform_admin())));

  GRANT SELECT ON public.poll_votes TO authenticated;
END $$;

-- ── STEP 6: survey_responses ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT pg_temp.colvy_v386_reset('survey_responses') THEN RETURN; END IF;

  CREATE POLICY survey_responses_member_read ON public.survey_responses
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.surveys s
                    WHERE s.id = survey_responses.survey_id
                      AND (is_company_member(s.company_id) OR is_platform_admin())));

  GRANT SELECT ON public.survey_responses TO authenticated;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 7: confirm ─────────────────────────────────────────────────────────
-- Expect: polls / surveys — *_public_read (SELECT {anon,authenticated}) and
-- *_member_read / _insert / _update / _delete ({authenticated});
-- poll_votes_member_read and survey_responses_member_read (SELECT {authenticated}).
SELECT tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('polls', 'poll_votes', 'surveys', 'survey_responses')
 ORDER BY tablename, policyname;

-- ── STEP 8: privileges the API roles shouldn't have ─────────────────────────
-- Should return no rows.
SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee IN ('anon', 'authenticated')
   AND (
        (table_name IN ('polls', 'surveys') AND grantee = 'anon' AND privilege_type <> 'SELECT')
     OR (table_name IN ('polls', 'surveys') AND privilege_type NOT IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
     OR (table_name IN ('poll_votes', 'survey_responses') AND (grantee = 'anon' OR privilege_type <> 'SELECT'))
   );

-- ── STEP 9: polls and surveys that belong to no workspace ───────────────────
-- Made before V96 added company_id. Their public pages keep working; only the
-- server can manage them. Give real ones a company_id:
--   update polls set company_id = '<company id>' where id = '<poll id>';
SELECT 'poll' AS kind, id, question AS title, created_at FROM public.polls WHERE company_id IS NULL
UNION ALL
SELECT 'survey', id, title, created_at FROM public.surveys WHERE company_id IS NULL
ORDER BY created_at DESC;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Only if polls or surveys stop working for staff and it can't wait for a fix.
-- This reopens exactly the hole closed above — a stopgap only. The code from
-- claude/polls-surveys keeps working either way. The added columns are
-- harmless and are left in place (dropping settings would lose close dates
-- and other settings saved since).
--
--   DROP POLICY IF EXISTS polls_public_read ON public.polls;
--   DROP POLICY IF EXISTS polls_member_read ON public.polls;
--   DROP POLICY IF EXISTS polls_member_insert ON public.polls;
--   DROP POLICY IF EXISTS polls_member_update ON public.polls;
--   DROP POLICY IF EXISTS polls_member_delete ON public.polls;
--   CREATE POLICY "Polls are viewable by everyone" ON public.polls FOR SELECT USING (true);
--   CREATE POLICY "Anyone can manage polls" ON public.polls FOR ALL USING (true);
--   GRANT ALL ON public.polls TO anon, authenticated;
--
--   DROP POLICY IF EXISTS poll_votes_member_read ON public.poll_votes;
--   CREATE POLICY "Poll votes are viewable by everyone" ON public.poll_votes FOR SELECT USING (true);
--   CREATE POLICY "Anyone can vote in polls" ON public.poll_votes FOR INSERT WITH CHECK (true);
--   GRANT ALL ON public.poll_votes TO anon, authenticated;
--
--   DROP POLICY IF EXISTS surveys_public_read ON public.surveys;
--   DROP POLICY IF EXISTS surveys_member_read ON public.surveys;
--   DROP POLICY IF EXISTS surveys_member_insert ON public.surveys;
--   DROP POLICY IF EXISTS surveys_member_update ON public.surveys;
--   DROP POLICY IF EXISTS surveys_member_delete ON public.surveys;
--   CREATE POLICY "Surveys are viewable by everyone" ON public.surveys FOR SELECT USING (true);
--   CREATE POLICY "Anyone can manage surveys" ON public.surveys FOR ALL USING (true);
--   GRANT ALL ON public.surveys TO anon, authenticated;
--
--   DROP POLICY IF EXISTS survey_responses_member_read ON public.survey_responses;
--   CREATE POLICY "Survey responses are viewable by everyone" ON public.survey_responses FOR SELECT USING (true);
--   CREATE POLICY "Anyone can submit responses" ON public.survey_responses FOR INSERT WITH CHECK (true);
--   GRANT ALL ON public.survey_responses TO anon, authenticated;
--   NOTIFY pgrst, 'reload schema';
