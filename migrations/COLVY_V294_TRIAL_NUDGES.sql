-- ============================================================
-- COLVY V294 — TRIAL NUDGES
--
-- Records which trial-conversion emails have been sent to a company, so the
-- /api/cron/trial-nudges worker sends each nudge at most once per trial cycle
-- (T-3 days, on expiry, and 3 days after). The trial_ends_at is part of the key
-- so a re-started / extended trial gets a fresh set of nudges.
--
-- Run the whole file in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS trial_nudges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  kind TEXT NOT NULL,             -- 't_minus_3' | 't_zero' | 't_plus_3'
  trial_ends_at TIMESTAMPTZ,      -- the trial end this nudge was sent for
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- One row per (company, milestone, trial end) — the worker inserts before send
-- and skips if the row already exists.
CREATE UNIQUE INDEX IF NOT EXISTS trial_nudges_uniq
  ON trial_nudges(company_id, kind, trial_ends_at);

ALTER TABLE trial_nudges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage trial_nudges" ON trial_nudges;
CREATE POLICY "Anyone can manage trial_nudges" ON trial_nudges FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
