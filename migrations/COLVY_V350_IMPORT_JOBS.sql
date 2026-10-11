-- ============================================================
-- COLVY V350 — IMPORT JOBS (background imports with undo)
--
-- The Import page now runs imports as jobs on the server:
--   • import_jobs holds each import — its source, progress, counts and errors.
--     The work continues in the background (cron /api/cron/import-worker) even
--     if the person closes the page.
--   • Every row an import creates is tagged with its job (import_job_id), so
--     "Undo" removes exactly what that import added and nothing else.
--
-- import_jobs is server-only (RLS on, no policies): the admin reads it through
-- /api/import/jobs, which checks the caller belongs to the company. Credentials
-- an import needs (e.g. a Canny API key) are wiped from the job when it ends.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS import_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL,
  source        TEXT NOT NULL,              -- csv | canny | zendesk
  status        TEXT NOT NULL DEFAULT 'queued',  -- queued | running | done | failed | cancelled | undone
  stage         TEXT,                       -- fetch | write
  options       JSONB DEFAULT '{}'::jsonb,  -- what to import, column mapping, credentials (wiped on finish)
  payload       JSONB,                      -- normalised items waiting to be written
  cursor        JSONB DEFAULT '{}'::jsonb,  -- where the worker is up to
  counts        JSONB DEFAULT '{}'::jsonb,  -- { ideas, comments, articles, announcements, skipped }
  total         INT DEFAULT 0,
  errors        JSONB DEFAULT '[]'::jsonb,
  created_by    UUID,
  created_by_name TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ,
  undone_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS import_jobs_company_idx ON import_jobs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS import_jobs_active_idx ON import_jobs (status, updated_at) WHERE status IN ('queued', 'running');

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (server routes) reads or writes it.
REVOKE ALL ON import_jobs FROM anon, authenticated;

-- Tag what each import creates, so Undo can remove exactly that.
ALTER TABLE ideas          ADD COLUMN IF NOT EXISTS import_job_id UUID;
ALTER TABLE comments       ADD COLUMN IF NOT EXISTS import_job_id UUID;
ALTER TABLE help_articles  ADD COLUMN IF NOT EXISTS import_job_id UUID;
ALTER TABLE announcements  ADD COLUMN IF NOT EXISTS import_job_id UUID;
CREATE INDEX IF NOT EXISTS ideas_import_job_idx         ON ideas (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS comments_import_job_idx      ON comments (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS help_articles_import_job_idx ON help_articles (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS announcements_import_job_idx ON announcements (import_job_id) WHERE import_job_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
