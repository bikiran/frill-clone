-- ============================================================
-- COLVY V435 — JOBS & SERVICES: REPEATING JOBS
--
-- A fortnightly clean, a monthly pool service, a quarterly pest spray: one
-- job set to repeat, and Colvy makes each visit as its own job (same
-- customer, address, team, checklist and price) a few weeks ahead, so it's
-- on the board, the Calendar and the team's phones like any other job.
--
-- Creates:
--   job_repeats            a series: every N weeks or months, from the first
--                          visit's date and time, until never / after N
--                          visits / a date, and what each visit copies
--   jobs.repeat_id         the series a job belongs to
--   jobs.repeat_seq        which visit it is (1 = the first)
--
-- A visit is made once: (repeat_id, repeat_seq) is unique, and the series'
-- last_seq is claimed (compare-and-set) before each one is made.
--
-- Access: server only, like V427 (RLS on, no anon/authenticated grants).
-- Needs V427 and V428 first. Safe to re-run. Rollback at the bottom.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.job_repeats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,   -- visit 1
  every_n       INT  NOT NULL CHECK (every_n BETWEEN 1 AND 52),
  unit          TEXT NOT NULL CHECK (unit IN ('week','month')),
  ends          TEXT NOT NULL DEFAULT 'never' CHECK (ends IN ('never','after','on')),
  ends_after    INT CHECK (ends_after IS NULL OR ends_after BETWEEN 2 AND 520),
  ends_on       DATE,
  start_date    DATE NOT NULL,                   -- visit 1's day (the business's time zone)
  start_time    TEXT NOT NULL,                   -- "HH:MM", local
  duration_min  INT  NOT NULL DEFAULT 60 CHECK (duration_min BETWEEN 1 AND 10080),
  template      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- title, description, address, contact_id, conversation_id, assignees, value_cents, checklist
  last_seq      INT  NOT NULL DEFAULT 1,         -- the newest visit made so far
  active        BOOLEAN NOT NULL DEFAULT true,
  ended_reason  TEXT,                            -- 'finished' | 'stopped' | 'changed'
  stopped_at    TIMESTAMPTZ,
  created_by    UUID,
  created_by_name TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_repeats_active_idx ON public.job_repeats (active, company_id);

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS repeat_id UUID REFERENCES public.job_repeats(id) ON DELETE SET NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS repeat_seq INT;
CREATE UNIQUE INDEX IF NOT EXISTS jobs_repeat_seq_uniq ON public.jobs (repeat_id, repeat_seq) WHERE repeat_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_repeat_idx ON public.jobs (repeat_id, scheduled_start) WHERE repeat_id IS NOT NULL;

-- ── Access: server only ──────────────────────────────────────────────────────
DO $$ DECLARE r RECORD;
BEGIN
  ALTER TABLE public.job_repeats ENABLE ROW LEVEL SECURITY;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_repeats' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.job_repeats', r.policyname);
  END LOOP;
  REVOKE ALL ON public.job_repeats FROM anon, authenticated;
  GRANT ALL ON public.job_repeats TO service_role;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verify afterwards:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'jobs' AND column_name IN ('repeat_id','repeat_seq');

-- ── Rollback ────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.jobs_repeat_idx;
-- DROP INDEX IF EXISTS public.jobs_repeat_seq_uniq;
-- ALTER TABLE public.jobs DROP COLUMN IF EXISTS repeat_seq;
-- ALTER TABLE public.jobs DROP COLUMN IF EXISTS repeat_id;
-- DROP TABLE IF EXISTS public.job_repeats;
