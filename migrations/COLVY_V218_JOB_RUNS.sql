-- ============================================================
-- COLVY V218 — BACKGROUND JOB RUNS
-- An append-only record of every scheduled/background job execution
-- (email sync, campaign worker, …). Powers the Background Jobs page in the
-- Super Admin console so operators can see cadence, duration, throughput and
-- failures at a glance. Written best-effort from the job handlers and never
-- blocks the work itself. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS job_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job          TEXT NOT NULL,             -- email-sync | campaigns-process | ...
  status       TEXT DEFAULT 'success',    -- success | error | idle | running
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  duration_ms  INTEGER,
  detail       JSONB,                     -- small run summary (counts, ids)
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_runs_created ON job_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_job     ON job_runs(job, created_at DESC);

ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage job_runs" ON job_runs;
CREATE POLICY "Anyone can manage job_runs" ON job_runs FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
