-- COLVY V418 — saved Super Admin reports
--
-- Super Admin → Intelligence and the Overview dashboard read from PostHog,
-- Stripe mirrors and many tables, which can take several seconds. Each
-- report's latest result is saved here (lib/intel/cache): the panel shows the
-- saved copy straight away and refreshes it in the background, and the hourly
-- intel job keeps the common reports warm. Server only: RLS on, no policies
-- (the service role bypasses RLS). Before it runs, reports are cached in
-- memory only, as before. Safe to run more than once.

CREATE TABLE IF NOT EXISTS admin_report_cache (
  key          TEXT PRIMARY KEY,
  data         JSONB NOT NULL,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admin_report_cache ENABLE ROW LEVEL SECURITY;
