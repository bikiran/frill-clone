-- ============================================================
-- COLVY V439 — COLVY POWERS: MORE WAYS TO EARN
--
-- Run after COLVY_V438_COLVY_POWERS.sql. Adds what the new rewards need:
--   powers_activity        minutes of real use per person per day (for
--                          "Active on Colvy today" and "Time in Colvy")
--   powers_beat(...)       count one minute, at most once a minute however
--                          many tabs are open, in one locked step
--   powers_leaderboard     now also totals replies, calls and orders
--   powers_challenges      challenges can count replies, calls and orders
--
-- Server only, like V438. Safe to re-run. Rollback at the bottom.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.powers_activity (
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  day           DATE NOT NULL,          -- the business's local day
  minutes       INT  NOT NULL DEFAULT 0 CHECK (minutes >= 0 AND minutes <= 1440),
  last_beat_at  TIMESTAMPTZ,
  PRIMARY KEY (company_id, user_id, day)
);
ALTER TABLE public.powers_activity ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.powers_activity FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.powers_activity FROM authenticated; END IF;
END $$;

-- One minute of real use. Counts only if the last counted minute was at least
-- p_gap seconds ago, so several tabs (or a too-eager page) can't add more
-- than one a minute. Answers { minutes, counted }.
CREATE OR REPLACE FUNCTION public.powers_beat(p_company UUID, p_user UUID, p_day DATE, p_gap INT DEFAULT 50)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.powers_activity;
BEGIN
  INSERT INTO public.powers_activity (company_id, user_id, day, minutes, last_beat_at)
  VALUES (p_company, p_user, p_day, 1, now())
  ON CONFLICT (company_id, user_id, day) DO NOTHING
  RETURNING * INTO r;
  IF FOUND THEN RETURN jsonb_build_object('minutes', r.minutes, 'counted', true); END IF;
  UPDATE public.powers_activity SET minutes = least(minutes + 1, 1440), last_beat_at = now()
   WHERE company_id = p_company AND user_id = p_user AND day = p_day
     AND (last_beat_at IS NULL OR last_beat_at <= now() - make_interval(secs => greatest(coalesce(p_gap, 50), 1)))
  RETURNING * INTO r;
  IF FOUND THEN RETURN jsonb_build_object('minutes', r.minutes, 'counted', true); END IF;
  SELECT * INTO r FROM public.powers_activity WHERE company_id = p_company AND user_id = p_user AND day = p_day;
  RETURN jsonb_build_object('minutes', coalesce(r.minutes, 0), 'counted', false);
END $$;

-- Leaderboard totals, now with replies, calls and orders (the result shape
-- changes, so the old one goes first).
DROP FUNCTION IF EXISTS public.powers_leaderboard(uuid, date, date, uuid);
CREATE FUNCTION public.powers_leaderboard(p_company UUID, p_since DATE, p_until DATE DEFAULT NULL, p_user UUID DEFAULT NULL)
RETURNS TABLE (user_id UUID, xp BIGINT, coins BIGINT, resolve BIGINT, task BIGINT, job BIGINT, thanks BIGINT, feedback BIGINT, challenge BIGINT, reply BIGINT, call BIGINT, "order" BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.user_id,
         coalesce(sum(l.xp), 0)::bigint,
         coalesce(sum(greatest(l.coins, 0)), 0)::bigint,
         count(*) FILTER (WHERE l.rule = 'resolve'),
         count(*) FILTER (WHERE l.rule = 'task'),
         count(*) FILTER (WHERE l.rule = 'job'),
         count(*) FILTER (WHERE l.rule = 'thanks'),
         count(*) FILTER (WHERE l.rule = 'feedback'),
         count(*) FILTER (WHERE l.rule = 'challenge'),
         count(*) FILTER (WHERE l.rule = 'reply'),
         count(*) FILTER (WHERE l.rule = 'call'),
         count(*) FILTER (WHERE l.rule = 'order')
    FROM public.powers_ledger l
   WHERE l.company_id = p_company AND l.kind = 'reward' AND l.reversed_at IS NULL
     AND l.day >= p_since AND (p_until IS NULL OR l.day < p_until)
     AND (p_user IS NULL OR l.user_id = p_user)
   GROUP BY l.user_id
$$;

-- Challenges can count replies, calls and orders too.
ALTER TABLE public.powers_challenges DROP CONSTRAINT IF EXISTS powers_challenges_metric_check;
ALTER TABLE public.powers_challenges ADD CONSTRAINT powers_challenges_metric_check
  CHECK (metric IN ('resolve','reply','call','task','job','order','thanks','feedback'));

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.powers_beat(uuid, uuid, date, int)', 'public.powers_leaderboard(uuid, date, date, uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f); END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- (Re-run the leaderboard part of V438 to put back the shorter totals.)
-- DROP FUNCTION IF EXISTS public.powers_beat(uuid, uuid, date, int);
-- DROP TABLE IF EXISTS public.powers_activity;
-- ALTER TABLE public.powers_challenges DROP CONSTRAINT IF EXISTS powers_challenges_metric_check;
-- ALTER TABLE public.powers_challenges ADD CONSTRAINT powers_challenges_metric_check CHECK (metric IN ('resolve','task','job','thanks','feedback'));
