-- ============================================================
-- COLVY V376 — FORM VIEWS, STARTS AND DROP-OFF
--
-- Only finished responses are saved (form_responses), so Results can't say how
-- many people opened a form, started it, or where they gave up. This adds one
-- small counter table and two functions:
--
--   form_stats            one row per form / hour (UTC) / metric / key with a
--                         running count. metric is 'view', 'start' or
--                         'abandon'; key is the question id for 'abandon' and
--                         '' otherwise. first_at is set on insert and never
--                         changed, so "tracked since" is an exact instant.
--   form_stats_bump()     +1 for a form/metric/key in the current hour. Called
--                         by POST /api/forms/track (the public form).
--   form_stats_summary()  views, starts, per-day totals in the viewer's time
--                         zone and abandons per question, as ONE jsonb value
--                         (so PostgREST's 1000-row cap can't cut it short).
--                         Called by GET /api/forms/stats (Results).
--
-- No IP address, user agent or answer is ever stored, only counts.
-- Service role only: RLS is on with no policies, and anon / authenticated have
-- no table or function privileges. The browser never touches it.
--
-- ── BEFORE RUNNING ──────────────────────────────────────────────────────────
-- Nothing. The code works before and after: until this runs, /api/forms/track
-- still answers 204 (the failed rpc is logged once per server instance) and
-- Results hide the views / starts / completion tiles (stats → tracked:false).
-- Independent of V375 (forms lockdown); the two can run in either order.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. SELECT form_stats_summary('<a published form id>');
--        → {"since": null, "views": 0, "starts": 0, "byDay": [], "abandons": {}}
--   2. Open that form's public link in a private window and press Start.
--      Step 1 again shows views 1, starts 1 and a "since" time.
--   3. As anon (or with the anon key) this fails with "permission denied":
--        SET ROLE anon; SELECT * FROM form_stats; RESET ROLE;
--
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS form_stats_summary(uuid, timestamptz, timestamptz, text);
--   DROP FUNCTION IF EXISTS form_stats_bump(uuid, text, text);
--   DROP TABLE IF EXISTS form_stats;
--   NOTIFY pgrst, 'reload schema';
-- (The code keeps working: tracking becomes a no-op again.)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.form_stats (
  form_id  uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  bucket   timestamptz NOT NULL,                 -- date_trunc('hour', now()), an instant (UTC hour)
  metric   text NOT NULL CHECK (metric IN ('view', 'start', 'abandon')),
  key      text NOT NULL DEFAULT '',             -- question id for 'abandon', '' otherwise
  count    integer NOT NULL DEFAULT 0,
  first_at timestamptz NOT NULL DEFAULT now(),   -- set on insert, never updated
  PRIMARY KEY (form_id, bucket, metric, key)
);

ALTER TABLE public.form_stats ENABLE ROW LEVEL SECURITY;   -- no policies: only the service role reads or writes
REVOKE ALL ON public.form_stats FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.form_stats TO service_role;

-- +1 for this form / metric / key in the current hour. A metric outside the
-- CHECK list raises (the route only sends the three, and swallows errors).
CREATE OR REPLACE FUNCTION public.form_stats_bump(p_form_id uuid, p_metric text, p_key text DEFAULT '')
RETURNS void LANGUAGE sql SET search_path = public AS $$
  INSERT INTO public.form_stats (form_id, bucket, metric, key, count)
  VALUES (p_form_id, date_trunc('hour', now()), p_metric, left(coalesce(p_key, ''), 80), 1)
  ON CONFLICT (form_id, bucket, metric, key) DO UPDATE SET count = public.form_stats.count + 1;
$$;

-- Totals for one form between p_from and p_to (either may be NULL), with days
-- in p_tz (an IANA zone the route has already validated). "since" ignores the
-- range: it's when tracking first saw this form.
CREATE OR REPLACE FUNCTION public.form_stats_summary(
  p_form_id uuid, p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL, p_tz text DEFAULT 'UTC'
)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH r AS (
    SELECT * FROM public.form_stats
     WHERE form_id = p_form_id
       AND (p_from IS NULL OR bucket >= date_trunc('hour', p_from))
       AND (p_to   IS NULL OR bucket <  p_to)
  )
  SELECT jsonb_build_object(
    'since',    (SELECT min(first_at) FROM public.form_stats WHERE form_id = p_form_id),
    'views',    coalesce((SELECT sum(count) FROM r WHERE metric = 'view'), 0),
    'starts',   coalesce((SELECT sum(count) FROM r WHERE metric = 'start'), 0),
    'byDay',    coalesce((SELECT jsonb_agg(x.d ORDER BY x.day) FROM (
                  SELECT (bucket AT TIME ZONE p_tz)::date AS day,
                         jsonb_build_object('day', (bucket AT TIME ZONE p_tz)::date,
                                            'views',  coalesce(sum(count) FILTER (WHERE metric = 'view'), 0),
                                            'starts', coalesce(sum(count) FILTER (WHERE metric = 'start'), 0)) AS d
                    FROM r WHERE metric IN ('view', 'start') GROUP BY (bucket AT TIME ZONE p_tz)::date) x), '[]'::jsonb),
    'abandons', coalesce((SELECT jsonb_object_agg(key, total) FROM (
                  SELECT key, sum(count) AS total FROM r WHERE metric = 'abandon' GROUP BY key) a), '{}'::jsonb)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.form_stats_bump(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.form_stats_summary(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.form_stats_bump(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.form_stats_summary(uuid, timestamptz, timestamptz, text) TO service_role;

NOTIFY pgrst, 'reload schema';
