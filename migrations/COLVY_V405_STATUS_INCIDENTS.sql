-- ============================================================
-- COLVY V405 — STATUS PAGE: INCIDENTS AND UPTIME HISTORY
--
-- colvy.com/status shows each component's live health, computed on the server
-- from Colvy's own logs (lib/status-health.ts, lib/status-server.ts; no table
-- needed for that). This adds the two things that need storing:
--
--   • incidents the Colvy team posts (Platform admin → Status & Incidents),
--     shown prominently while open and for 14 days after; an open incident
--     lifts the components it names to at least its impact;
--   • a five-minute status snapshot (cron /api/cron/status-snapshot), rolled
--     up per day and component, for the page's 30-day bars.
--
-- Creates:
--   status_incidents      one row per incident
--     title                 what customers read (1–140 characters)
--     status                investigating | identified | monitoring | resolved
--     impact                minor | major | critical
--     components            text[] of component keys: web, database, jobs,
--                           messaging, email, payments, integrations
--     updates               jsonb array of {at, status, message}, oldest first
--     started_at, resolved_at   resolved_at is set exactly when resolved
--     published             false = a draft only the platform admin sees
--     created_by, created_at, updated_at
--   status_snapshots      one row per five-minute bucket (bucket is unique, so
--                         a second run in the same five minutes is a no-op)
--     bucket, day (Sydney date), overall, components {key: status}
--   status_daily          per day and component: how many snapshots were
--                         operational / degraded / outage / unknown
--                         (recounted from that day's snapshots, so idempotent)
--   Snapshots and daily rows older than 90 days are deleted by the cron.
--
-- Access: SERVER ONLY. RLS on, no policies, and no privileges for anon or
-- authenticated: the public page and /api/status read published incidents and
-- the history with the service role and send out only coarse, whitelisted
-- fields (lib/status-health.ts toPublicStatus). Drafts never leave the server.
-- The platform admin writes through /api/platform-admin/status, which checks
-- the super admin and records each change in super_admin_audit.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- Any time, before or after the code from branch claude/status-page is
-- deployed. Until it runs, the status page shows the live component checks
-- only (the incident and history sections are hidden), the admin page says
-- to run this file, and the snapshot cron answers "not set up".
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. The last query lists the three tables with rls = true and no policies.
--   2. Platform admin → Status & Incidents → Open an incident (published):
--      colvy.com/status shows it at the top within a minute.
--   3. With the anon key: select * from status_incidents;  → permission denied
--   4. After ten minutes: select count(*) from status_snapshots;  → 2 or more
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 1: incidents ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.status_incidents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'investigating',
  impact       TEXT NOT NULL DEFAULT 'minor',
  components   TEXT[] NOT NULL DEFAULT '{}',
  updates      JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  published    BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Columns any hand-made table lacks.
ALTER TABLE public.status_incidents
  ADD COLUMN IF NOT EXISTS title        TEXT,
  ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'investigating',
  ADD COLUMN IF NOT EXISTS impact       TEXT NOT NULL DEFAULT 'minor',
  ADD COLUMN IF NOT EXISTS components   TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updates      JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS resolved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by   UUID,
  ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS status_incidents_started_idx ON public.status_incidents (started_at DESC);
CREATE INDEX IF NOT EXISTS status_incidents_open_idx ON public.status_incidents (status) WHERE status <> 'resolved';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'status_incidents_title_check') THEN
    ALTER TABLE public.status_incidents ADD CONSTRAINT status_incidents_title_check
      CHECK (title IS NOT NULL AND char_length(btrim(title)) BETWEEN 1 AND 140);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'status_incidents_status_check') THEN
    ALTER TABLE public.status_incidents ADD CONSTRAINT status_incidents_status_check
      CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'status_incidents_impact_check') THEN
    ALTER TABLE public.status_incidents ADD CONSTRAINT status_incidents_impact_check
      CHECK (impact IN ('minor', 'major', 'critical'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'status_incidents_components_check') THEN
    ALTER TABLE public.status_incidents ADD CONSTRAINT status_incidents_components_check
      CHECK (components <@ ARRAY['web', 'database', 'jobs', 'messaging', 'email', 'payments', 'integrations']::text[]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'status_incidents_updates_array') THEN
    ALTER TABLE public.status_incidents ADD CONSTRAINT status_incidents_updates_array
      CHECK (jsonb_typeof(updates) = 'array');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'status_incidents_resolved_check') THEN
    ALTER TABLE public.status_incidents ADD CONSTRAINT status_incidents_resolved_check
      CHECK ((status = 'resolved') = (resolved_at IS NOT NULL));
  END IF;
END $$;

-- ── STEP 2: five-minute snapshots ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.status_snapshots (
  id          BIGSERIAL PRIMARY KEY,
  bucket      TIMESTAMPTZ NOT NULL,
  day         DATE NOT NULL,
  overall     TEXT NOT NULL,
  components  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.status_snapshots
  ADD COLUMN IF NOT EXISTS bucket      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS day         DATE,
  ADD COLUMN IF NOT EXISTS overall     TEXT,
  ADD COLUMN IF NOT EXISTS components  JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS status_snapshots_bucket_key ON public.status_snapshots (bucket);
CREATE INDEX IF NOT EXISTS status_snapshots_day_idx ON public.status_snapshots (day);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'status_snapshots_components_object') THEN
    ALTER TABLE public.status_snapshots ADD CONSTRAINT status_snapshots_components_object
      CHECK (jsonb_typeof(components) = 'object');
  END IF;
END $$;

-- ── STEP 3: daily roll-up ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.status_daily (
  day          DATE NOT NULL,
  component    TEXT NOT NULL,
  operational  INTEGER NOT NULL DEFAULT 0,
  degraded     INTEGER NOT NULL DEFAULT 0,
  outage       INTEGER NOT NULL DEFAULT 0,
  unknown      INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day, component)
);
ALTER TABLE public.status_daily
  ADD COLUMN IF NOT EXISTS operational  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS degraded     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outage       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unknown      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT now();
-- The upsert's conflict target, for a hand-made table without the primary key.
CREATE UNIQUE INDEX IF NOT EXISTS status_daily_day_component_key ON public.status_daily (day, component);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'status_daily_counts_check') THEN
    ALTER TABLE public.status_daily ADD CONSTRAINT status_daily_counts_check
      CHECK (operational >= 0 AND degraded >= 0 AND outage >= 0 AND unknown >= 0);
  END IF;
END $$;

-- ── STEP 4: access (server only) ────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['status_incidents', 'status_snapshots', 'status_daily'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
  IF to_regclass('public.status_snapshots_id_seq') IS NOT NULL THEN
    REVOKE ALL ON SEQUENCE public.status_snapshots_id_seq FROM anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.status_snapshots_id_seq TO service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 5: check ───────────────────────────────────────────────────────────
SELECT c.relname AS table_name, c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN ('status_incidents', 'status_snapshots', 'status_daily')
 ORDER BY 1;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- The status page goes back to live component checks only (the code keeps
-- working without the tables: incidents and the 30-day bars disappear, the
-- snapshot cron answers "not set up"). Dropping status_incidents loses the
-- incident history, so export it first if you need it.
--
--   DROP TABLE IF EXISTS public.status_daily;
--   DROP TABLE IF EXISTS public.status_snapshots;
--   DROP TABLE IF EXISTS public.status_incidents;
--   NOTIFY pgrst, 'reload schema';
