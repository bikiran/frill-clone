-- ============================================================
-- COLVY V367 — AUDIT LOG TIMES ARE UTC (activity_logs.created_at → TIMESTAMPTZ)
--
-- add_activity_logs.sql made activity_logs.created_at a plain TIMESTAMP (no
-- time zone). V364's CREATE TABLE IF NOT EXISTS has TIMESTAMPTZ, but where the
-- table already existed it changed nothing. Since V364 the server writes every
-- team change here (lib/activity-logging.ts sends UTC), and a TIMESTAMP column
-- keeps the clock reading but drops the "this is UTC" part. The API then hands
-- it back without an offset and the browser reads it as local time, so in
-- Sydney a 2pm role change showed as 3am on Settings → Audit Logs.
--
-- Every value already in the column is UTC (written as UTC by the server, or
-- by the column's NOW() default in Supabase's UTC sessions), so each is read
-- as UTC and kept as the same moment. The default is set again so new rows
-- don't depend on the session's time zone.
--
-- Only does anything when the column is still TIMESTAMP; where V364 created
-- the table, or this has already run, it's left alone. Policies, grants and
-- indexes stay as they are (the indexes are rebuilt). It rewrites the table
-- and holds up audit-log writes for that moment; the table is small.
--
-- Deploy-order free: the Audit Logs page reads either type correctly.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'activity_logs'
       AND column_name = 'created_at' AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE public.activity_logs ALTER COLUMN created_at DROP DEFAULT;
    ALTER TABLE public.activity_logs
      ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
    ALTER TABLE public.activity_logs ALTER COLUMN created_at SET DEFAULT NOW();
    RAISE NOTICE 'activity_logs.created_at is now TIMESTAMPTZ';
  ELSE
    RAISE NOTICE 'activity_logs.created_at already TIMESTAMPTZ (or no table): nothing to do';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── Check ───────────────────────────────────────────────────────────────────
-- Expect: timestamp with time zone, default now().
SELECT data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'activity_logs' AND column_name = 'created_at';
