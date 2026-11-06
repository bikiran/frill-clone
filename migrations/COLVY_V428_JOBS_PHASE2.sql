-- ============================================================
-- COLVY V428 — JOBS & SERVICES (PHASE 2: DOING THE WORK)
--
-- On top of V427 (quotes and jobs):
--   jobs.assignees            who's doing it: [{ id: <auth user id>, name }]
--   jobs.calendar_event_id    its row in calendar_events (external_source
--                             'job'), so a scheduled job shows on the team
--                             Calendar and blocks those people's booking slots
--   jobs.signature            the customer's sign-off { name, url, signed_at,
--                             attachment_id, collected_by }
--   jobs.started_at / completed_at / time_seconds (closed time, cached)
--   job_checklist_items       one row per item, so two people ticking at once
--                             can't undo each other
--   job_checklists            saved checklists to add to a job
--   job_attachments           before / after / other photos and the signature
--                             image (the file is in storage; a copy shows in Gallery)
--   job_time_entries          start / pause / finish, per person; one open
--                             entry per person per job, enforced here
--
-- Access: server only, like V427 (RLS on, no anon/authenticated grants).
-- Run in the Supabase SQL editor after V427. Safe to re-run. Rollback at the bottom.
-- ============================================================

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS assignees JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS calendar_event_id UUID;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS signature JSONB;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS time_seconds BIGINT NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE public.jobs ADD CONSTRAINT jobs_assignees_array CHECK (jsonb_typeof(assignees) = 'array');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- "Jobs assigned to me": jobs.assignees @> '[{"id": "<user>"}]'
CREATE INDEX IF NOT EXISTS jobs_assignees_gin ON public.jobs USING gin (assignees jsonb_path_ops);

-- ── Checklists ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_checklist_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id       UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  text         TEXT NOT NULL,
  done         BOOLEAN NOT NULL DEFAULT false,
  done_by_id   UUID,
  done_by_name TEXT,
  done_at      TIMESTAMPTZ,
  sort_order   DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_checklist_items_job_idx ON public.job_checklist_items (job_id, sort_order);

CREATE TABLE IF NOT EXISTS public.job_checklists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  items      JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),   -- ["Isolate power", …]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_checklists_company_idx ON public.job_checklists (company_id, name);

-- ── Photos and the signature image ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_attachments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id           UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('before','after','other','signature')),
  url              TEXT NOT NULL,
  name             TEXT,
  mime             TEXT,
  caption          TEXT,
  media_item_id    UUID,          -- its copy in the Gallery (media_items)
  uploaded_by_id   UUID,
  uploaded_by_name TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_attachments_job_idx ON public.job_attachments (job_id, created_at);

-- ── Time tracking ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_time_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id     UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  user_name  TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at   TIMESTAMPTZ,
  seconds    BIGINT,          -- set when the entry is closed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
-- One running timer per person per job: a double tap on Start can't make two.
CREATE UNIQUE INDEX IF NOT EXISTS job_time_entries_open_uniq ON public.job_time_entries (job_id, user_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS job_time_entries_job_idx ON public.job_time_entries (job_id, started_at);
CREATE INDEX IF NOT EXISTS job_time_entries_user_idx ON public.job_time_entries (company_id, user_id, started_at DESC);

-- ── Access: server only ──────────────────────────────────────────────────────
DO $$ DECLARE t TEXT; r RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['job_checklist_items','job_checklists','job_attachments','job_time_entries'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verify afterwards (should list the four tables):
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
--   AND table_name IN ('job_checklist_items','job_checklists','job_attachments','job_time_entries');

-- ── Rollback ────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.job_time_entries, public.job_attachments, public.job_checklists, public.job_checklist_items;
-- DROP INDEX IF EXISTS public.jobs_assignees_gin;
-- ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_assignees_array;
-- ALTER TABLE public.jobs DROP COLUMN IF EXISTS time_seconds, DROP COLUMN IF EXISTS completed_at, DROP COLUMN IF EXISTS started_at,
--   DROP COLUMN IF EXISTS signature, DROP COLUMN IF EXISTS calendar_event_id, DROP COLUMN IF EXISTS assignees;
