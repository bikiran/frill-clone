-- ============================================================
-- COLVY V438 — COLVY POWERS (TEAM REWARDS AND POWER-UPS)
--
-- An optional, per-business layer that rewards real work: resolving
-- conversations, finishing assigned tasks and jobs, a teammate's thanks,
-- happy reviews that name someone. People earn XP (never spent, decides the
-- level) and Colvy Coins (spent on small playful powers: pin a chat in a
-- teammate's inbox, a nudge, a crown for a day). No real money anywhere:
-- coins can't be bought, cashed out or carried to another workspace.
-- docs/plans/colvy-powers.md has the full plan.
--
-- Creates (all new; no existing table is changed):
--   powers_settings          per-business switch (OFF until a business turns it on) + rules
--   powers_wallets           coins, XP and streak per person per business
--   powers_ledger            every coin and XP movement, append-only, with an
--                            idempotency key so one piece of work pays once
--   powers_activations       powers someone used: who, on whom, until when
--   powers_challenges        daily / weekly / team targets a business sets
--   powers_challenge_progress
--   powers_user_achievements
--   powers_award(...)        pay a reward / grant / revoke, in one locked step
--   powers_buy(...)          spend coins on a power and start it, in one step
--   powers_gift(...)         move coins between two teammates, in one step
--   powers_reverse(...)      take a reward back when its work is undone
--   powers_bump_progress(...) count one toward a challenge; says when it's done
--   powers_leaderboard(...)  rewards per person over a period, totalled in the database
--
-- Access: server only. RLS is on with no policies and no grants to anon or
-- authenticated; the app reads and writes through /api/powers/*, which checks
-- workspace membership. The functions run as their owner and can only be
-- called with the service role.
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── Settings ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.powers_settings (
  company_id  UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  enabled_at  TIMESTAMPTZ,                 -- work before this never pays (no back-fill)
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- rules, caps, prices, visibility (lib/powers/config.ts)
  updated_by  UUID,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Wallets ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.powers_wallets (
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL,
  coins          INT  NOT NULL DEFAULT 0 CHECK (coins >= 0),
  xp             INT  NOT NULL DEFAULT 0 CHECK (xp >= 0),
  earned_coins   INT  NOT NULL DEFAULT 0,  -- lifetime coins earned (not gifts or grants)
  streak         INT  NOT NULL DEFAULT 0,  -- days in a row with at least one reward
  best_streak    INT  NOT NULL DEFAULT 0,
  streak_day     DATE,                     -- the business's local day of the last reward
  savers         INT  NOT NULL DEFAULT 0 CHECK (savers >= 0),  -- Streak Savers held
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);
CREATE INDEX IF NOT EXISTS powers_wallets_xp_idx ON public.powers_wallets (company_id, xp DESC);

-- ── Ledger ───────────────────────────────────────────────────────────────────
-- kind: reward | grant | revoke | purchase | gift_in | gift_out | reversal | refund
CREATE TABLE IF NOT EXISTS public.powers_ledger (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  coins        INT  NOT NULL DEFAULT 0,
  xp           INT  NOT NULL DEFAULT 0,
  kind         TEXT NOT NULL CHECK (kind IN ('reward','grant','revoke','purchase','gift_in','gift_out','reversal','refund')),
  rule         TEXT,            -- resolve | task | job | feedback | thanks | challenge | achievement | <power id>
  ref_type     TEXT,            -- conversation | task | job | review | thanks | challenge | activation | user
  ref_id       TEXT,
  idem_key     TEXT,            -- one piece of work pays once
  day          DATE NOT NULL,   -- the business's local day, for daily limits and leaderboards
  actor_id     UUID,            -- who caused it (an admin's grant, a teammate's thanks)
  reason       TEXT,
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  reversed_at  TIMESTAMPTZ,     -- set when a later reversal took it back
  reversal_of  UUID,            -- on a reversal row: the row it takes back
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- A live (not reversed) row per key: the duplicate guard. A reversed reward
-- frees its key, so work that is redone (a task ticked again) can pay again.
CREATE UNIQUE INDEX IF NOT EXISTS powers_ledger_idem_uniq ON public.powers_ledger (company_id, idem_key)
  WHERE idem_key IS NOT NULL AND reversed_at IS NULL;
CREATE INDEX IF NOT EXISTS powers_ledger_user_idx ON public.powers_ledger (company_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS powers_ledger_day_idx ON public.powers_ledger (company_id, day, user_id);
CREATE INDEX IF NOT EXISTS powers_ledger_ref_idx ON public.powers_ledger (company_id, ref_type, ref_id);

-- ── Activations ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.powers_activations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  power           TEXT NOT NULL,
  user_id         UUID NOT NULL,       -- who used it
  target_user_id  UUID,                -- the teammate it's for, if any
  ref_id          TEXT,                -- e.g. the conversation a Priority Pin points at
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  price           INT  NOT NULL DEFAULT 0,
  ledger_id       UUID,
  idem_key        TEXT,
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at         TIMESTAMPTZ,         -- null: instant (a nudge, confetti)
  dismissed_at    TIMESTAMPTZ,         -- the target can dismiss anything that's in their way
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS powers_activations_idem_uniq ON public.powers_activations (company_id, idem_key) WHERE idem_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS powers_activations_live_idx ON public.powers_activations (company_id, ends_at DESC);
CREATE INDEX IF NOT EXISTS powers_activations_user_idx ON public.powers_activations (company_id, user_id, power, created_at DESC);
CREATE INDEX IF NOT EXISTS powers_activations_target_idx ON public.powers_activations (company_id, target_user_id, created_at DESC);

-- ── Challenges ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.powers_challenges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  scope         TEXT NOT NULL CHECK (scope IN ('daily','weekly','team')),
  metric        TEXT NOT NULL CHECK (metric IN ('resolve','task','job','thanks','feedback')),
  target        INT  NOT NULL CHECK (target > 0 AND target <= 10000),
  reward_coins  INT  NOT NULL DEFAULT 50 CHECK (reward_coins >= 0 AND reward_coins <= 5000),
  reward_xp     INT  NOT NULL DEFAULT 50 CHECK (reward_xp >= 0 AND reward_xp <= 5000),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS powers_challenges_company_idx ON public.powers_challenges (company_id, active);

-- Progress per challenge per period ('2026-11-16' for a day, '2026-W47' for a
-- week). user_id is null on a team challenge's shared row.
CREATE TABLE IF NOT EXISTS public.powers_challenge_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  challenge_id  UUID NOT NULL REFERENCES public.powers_challenges(id) ON DELETE CASCADE,
  user_id       UUID,
  period        TEXT NOT NULL,
  progress      INT  NOT NULL DEFAULT 0,
  completed_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS powers_progress_uniq ON public.powers_challenge_progress
  (challenge_id, period, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS powers_progress_company_idx ON public.powers_challenge_progress (company_id, period);

-- ── Achievements (the list itself lives in lib/powers/achievements.ts) ──────
CREATE TABLE IF NOT EXISTS public.powers_user_achievements (
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  code        TEXT NOT NULL,
  earned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id, code)
);

-- ── Lock everything down: server only ────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['powers_settings','powers_wallets','powers_ledger','powers_activations',
                           'powers_challenges','powers_challenge_progress','powers_user_achievements'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;

-- ── The wallet row, created on first use, locked for this transaction ───────
CREATE OR REPLACE FUNCTION public.powers_lock_wallet(p_company UUID, p_user UUID)
RETURNS public.powers_wallets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.powers_wallets;
BEGIN
  INSERT INTO public.powers_wallets (company_id, user_id) VALUES (p_company, p_user)
  ON CONFLICT (company_id, user_id) DO NOTHING;
  SELECT * INTO w FROM public.powers_wallets WHERE company_id = p_company AND user_id = p_user FOR UPDATE;
  RETURN w;
END $$;

-- ── Award: a reward, an admin grant, or an admin revoke ──────────────────────
-- Rewards respect the day's caps (coins and XP separately) and keep the streak.
-- A revoke never takes the balance below zero. Answers:
--   { status: 'ok' | 'duplicate' | 'capped', coins, xp, balance, total_xp, streak, id }
CREATE OR REPLACE FUNCTION public.powers_award(
  p_company UUID, p_user UUID, p_coins INT, p_xp INT, p_kind TEXT,
  p_rule TEXT, p_ref_type TEXT, p_ref_id TEXT, p_idem TEXT, p_day DATE,
  p_cap_coins INT DEFAULT NULL, p_cap_xp INT DEFAULT NULL,
  p_actor UUID DEFAULT NULL, p_reason TEXT DEFAULT NULL, p_meta JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w public.powers_wallets;
  c INT := coalesce(p_coins, 0);
  x INT := coalesce(p_xp, 0);
  used_c INT; used_x INT;
  rid UUID;
  new_streak INT; new_savers INT; old_savers INT; new_day DATE;
BEGIN
  IF p_kind NOT IN ('reward','grant','revoke') THEN RAISE EXCEPTION 'powers_award: bad kind %', p_kind; END IF;
  IF p_day IS NULL THEN RAISE EXCEPTION 'powers_award: day is required'; END IF;
  w := public.powers_lock_wallet(p_company, p_user);
  old_savers := w.savers;

  IF p_idem IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.powers_ledger WHERE company_id = p_company AND idem_key = p_idem AND reversed_at IS NULL
  ) THEN
    RETURN jsonb_build_object('status', 'duplicate', 'balance', w.coins, 'total_xp', w.xp);
  END IF;

  IF p_kind = 'reward' THEN
    c := greatest(c, 0); x := greatest(x, 0);
    IF p_cap_coins IS NOT NULL OR p_cap_xp IS NOT NULL THEN
      SELECT coalesce(sum(coins), 0), coalesce(sum(xp), 0) INTO used_c, used_x
        FROM public.powers_ledger
       WHERE company_id = p_company AND user_id = p_user AND day = p_day
         AND kind = 'reward' AND reversed_at IS NULL;
      IF p_cap_coins IS NOT NULL THEN c := least(c, greatest(p_cap_coins - used_c, 0)); END IF;
      IF p_cap_xp IS NOT NULL THEN x := least(x, greatest(p_cap_xp - used_x, 0)); END IF;
    END IF;
    IF c = 0 AND x = 0 AND (coalesce(p_coins, 0) > 0 OR coalesce(p_xp, 0) > 0) THEN
      RETURN jsonb_build_object('status', 'capped', 'balance', w.coins, 'total_xp', w.xp);
    END IF;
  ELSIF p_kind = 'grant' THEN
    c := greatest(c, 0); x := 0;
  ELSE -- revoke: coins only, never below zero
    c := -least(abs(c), w.coins); x := 0;
  END IF;

  BEGIN
    INSERT INTO public.powers_ledger (company_id, user_id, coins, xp, kind, rule, ref_type, ref_id, idem_key, day, actor_id, reason, meta)
    VALUES (p_company, p_user, c, x, p_kind, p_rule, p_ref_type, p_ref_id, p_idem, p_day, p_actor, left(p_reason, 300), coalesce(p_meta, '{}'::jsonb))
    RETURNING id INTO rid;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'duplicate', 'balance', w.coins, 'total_xp', w.xp);
  END;

  -- Streak: a reward on the next local day adds one; a missed day uses a
  -- Streak Saver if one is held, otherwise the streak starts again.
  new_streak := w.streak; new_savers := w.savers; new_day := w.streak_day;
  IF p_kind = 'reward' AND (w.streak_day IS NULL OR p_day > w.streak_day) THEN
    IF w.streak_day = p_day - 1 THEN new_streak := w.streak + 1;
    ELSIF w.streak_day = p_day - 2 AND w.savers > 0 THEN new_streak := w.streak + 1; new_savers := w.savers - 1;
    ELSE new_streak := 1;
    END IF;
    new_day := p_day;
  END IF;

  UPDATE public.powers_wallets SET
    coins = coins + c,
    xp = xp + x,
    earned_coins = earned_coins + CASE WHEN p_kind = 'reward' THEN c ELSE 0 END,
    streak = new_streak, best_streak = greatest(best_streak, new_streak),
    savers = new_savers, streak_day = new_day,
    updated_at = now()
  WHERE company_id = p_company AND user_id = p_user
  RETURNING * INTO w;

  RETURN jsonb_build_object('status', 'ok', 'id', rid, 'coins', c, 'xp', x, 'balance', w.coins,
    'total_xp', w.xp, 'streak', w.streak, 'saver_used', new_savers < old_savers);
END $$;

-- ── Buy a power and start it, in one step ────────────────────────────────────
-- Checks, in order: the same click twice (idempotent), the buyer's cooldown,
-- their daily limit, how often the target was picked in the last hour, and
-- the balance. Answers { status: 'ok' | 'duplicate' | 'cooldown' | 'daily_limit'
-- | 'target_busy' | 'short', ... }.
CREATE OR REPLACE FUNCTION public.powers_buy(
  p_company UUID, p_user UUID, p_power TEXT, p_price INT,
  p_target UUID, p_ref TEXT, p_payload JSONB, p_minutes INT,
  p_cooldown_min INT, p_daily_limit INT, p_since TIMESTAMPTZ,
  p_target_hourly INT, p_idem TEXT, p_day DATE, p_savers INT DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w public.powers_wallets;
  last_at TIMESTAMPTZ;
  n INT;
  lid UUID; aid UUID;
  a public.powers_activations;
BEGIN
  IF coalesce(p_price, -1) < 0 THEN RAISE EXCEPTION 'powers_buy: bad price'; END IF;
  w := public.powers_lock_wallet(p_company, p_user);

  IF p_idem IS NOT NULL THEN
    SELECT * INTO a FROM public.powers_activations WHERE company_id = p_company AND idem_key = p_idem;
    IF FOUND THEN RETURN jsonb_build_object('status', 'duplicate', 'activation', to_jsonb(a), 'balance', w.coins); END IF;
  END IF;

  IF coalesce(p_cooldown_min, 0) > 0 THEN
    SELECT max(created_at) INTO last_at FROM public.powers_activations
     WHERE company_id = p_company AND user_id = p_user AND power = p_power;
    IF last_at IS NOT NULL AND last_at > now() - make_interval(mins => p_cooldown_min) THEN
      RETURN jsonb_build_object('status', 'cooldown', 'until', last_at + make_interval(mins => p_cooldown_min), 'balance', w.coins);
    END IF;
  END IF;

  IF coalesce(p_daily_limit, 0) > 0 THEN
    SELECT count(*) INTO n FROM public.powers_activations
     WHERE company_id = p_company AND user_id = p_user AND power = p_power AND created_at >= p_since;
    IF n >= p_daily_limit THEN RETURN jsonb_build_object('status', 'daily_limit', 'balance', w.coins); END IF;
  END IF;

  IF p_target IS NOT NULL AND coalesce(p_target_hourly, 0) > 0 THEN
    SELECT count(*) INTO n FROM public.powers_activations
     WHERE company_id = p_company AND target_user_id = p_target AND created_at > now() - interval '1 hour';
    IF n >= p_target_hourly THEN RETURN jsonb_build_object('status', 'target_busy', 'balance', w.coins); END IF;
  END IF;

  IF w.coins < p_price THEN RETURN jsonb_build_object('status', 'short', 'balance', w.coins, 'price', p_price); END IF;

  INSERT INTO public.powers_ledger (company_id, user_id, coins, xp, kind, rule, ref_type, ref_id, idem_key, day, meta)
  VALUES (p_company, p_user, -p_price, 0, 'purchase', p_power, 'activation', NULL, CASE WHEN p_idem IS NULL THEN NULL ELSE 'buy:' || p_idem END, p_day,
          jsonb_build_object('target', p_target))
  RETURNING id INTO lid;

  INSERT INTO public.powers_activations (company_id, power, user_id, target_user_id, ref_id, payload, price, ledger_id, idem_key, starts_at, ends_at)
  VALUES (p_company, p_power, p_user, p_target, p_ref, coalesce(p_payload, '{}'::jsonb), p_price, lid, p_idem, now(),
          CASE WHEN coalesce(p_minutes, 0) > 0 THEN now() + make_interval(mins => p_minutes) ELSE NULL END)
  RETURNING * INTO a;

  UPDATE public.powers_ledger SET ref_id = a.id::text WHERE id = lid;
  UPDATE public.powers_wallets SET coins = coins - p_price, savers = savers + greatest(coalesce(p_savers, 0), 0), updated_at = now()
   WHERE company_id = p_company AND user_id = p_user RETURNING * INTO w;

  RETURN jsonb_build_object('status', 'ok', 'activation', to_jsonb(a), 'balance', w.coins, 'savers', w.savers);
END $$;

-- ── Gift coins to a teammate ─────────────────────────────────────────────────
-- Both wallets are locked in a fixed order, so two people gifting each other
-- at the same moment can't deadlock. Coins only, never XP.
CREATE OR REPLACE FUNCTION public.powers_gift(
  p_company UUID, p_from UUID, p_to UUID, p_amount INT, p_note TEXT,
  p_idem TEXT, p_day DATE, p_daily_max INT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  wf public.powers_wallets;
  sent INT;
BEGIN
  IF p_from = p_to THEN RETURN jsonb_build_object('status', 'self'); END IF;
  IF coalesce(p_amount, 0) <= 0 THEN RETURN jsonb_build_object('status', 'bad_amount'); END IF;
  IF p_from < p_to THEN
    wf := public.powers_lock_wallet(p_company, p_from); PERFORM public.powers_lock_wallet(p_company, p_to);
  ELSE
    PERFORM public.powers_lock_wallet(p_company, p_to); wf := public.powers_lock_wallet(p_company, p_from);
  END IF;

  IF p_idem IS NOT NULL AND EXISTS (SELECT 1 FROM public.powers_ledger WHERE company_id = p_company AND idem_key = p_idem || ':out' AND reversed_at IS NULL) THEN
    RETURN jsonb_build_object('status', 'duplicate', 'balance', wf.coins);
  END IF;
  IF coalesce(p_daily_max, 0) > 0 THEN
    SELECT coalesce(-sum(coins), 0) INTO sent FROM public.powers_ledger
     WHERE company_id = p_company AND user_id = p_from AND day = p_day AND kind = 'gift_out' AND reversed_at IS NULL;
    IF sent + p_amount > p_daily_max THEN RETURN jsonb_build_object('status', 'daily_limit', 'balance', wf.coins, 'left', greatest(p_daily_max - sent, 0)); END IF;
  END IF;
  IF wf.coins < p_amount THEN RETURN jsonb_build_object('status', 'short', 'balance', wf.coins); END IF;

  INSERT INTO public.powers_ledger (company_id, user_id, coins, kind, rule, ref_type, ref_id, idem_key, day, actor_id, reason)
  VALUES (p_company, p_from, -p_amount, 'gift_out', 'gift', 'user', p_to::text, CASE WHEN p_idem IS NULL THEN NULL ELSE p_idem || ':out' END, p_day, p_from, left(p_note, 140)),
         (p_company, p_to,    p_amount, 'gift_in',  'gift', 'user', p_from::text, CASE WHEN p_idem IS NULL THEN NULL ELSE p_idem || ':in' END, p_day, p_from, left(p_note, 140));
  UPDATE public.powers_wallets SET coins = coins - p_amount, updated_at = now() WHERE company_id = p_company AND user_id = p_from RETURNING * INTO wf;
  UPDATE public.powers_wallets SET coins = coins + p_amount, updated_at = now() WHERE company_id = p_company AND user_id = p_to;
  RETURN jsonb_build_object('status', 'ok', 'balance', wf.coins);
END $$;

-- ── Take a reward back (its work was undone or deleted) ──────────────────────
-- Takes back what it can (a balance never goes below zero), marks the reward
-- reversed and writes the reversal next to it. Answers { status: 'ok' |
-- 'none', coins, xp }.
CREATE OR REPLACE FUNCTION public.powers_reverse(
  p_company UUID, p_idem TEXT, p_reason TEXT, p_day DATE
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.powers_ledger;
  w public.powers_wallets;
  tc INT; tx INT;
BEGIN
  SELECT * INTO r FROM public.powers_ledger
   WHERE company_id = p_company AND idem_key = p_idem AND reversed_at IS NULL AND kind = 'reward';
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'none'); END IF;
  w := public.powers_lock_wallet(p_company, r.user_id);
  -- Re-read under the lock: a reversal running at the same moment may have won.
  SELECT * INTO r FROM public.powers_ledger WHERE id = r.id AND reversed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'none'); END IF;

  tc := least(greatest(r.coins, 0), w.coins);
  tx := least(greatest(r.xp, 0), w.xp);
  UPDATE public.powers_ledger SET reversed_at = now() WHERE id = r.id;
  INSERT INTO public.powers_ledger (company_id, user_id, coins, xp, kind, rule, ref_type, ref_id, idem_key, day, reason, reversal_of)
  VALUES (p_company, r.user_id, -tc, -tx, 'reversal', r.rule, r.ref_type, r.ref_id, 'rev:' || r.id, coalesce(p_day, r.day), left(p_reason, 300), r.id);
  UPDATE public.powers_wallets SET coins = coins - tc, xp = xp - tx,
    earned_coins = greatest(earned_coins - tc, 0), updated_at = now()
   WHERE company_id = p_company AND user_id = r.user_id;
  RETURN jsonb_build_object('status', 'ok', 'coins', -tc, 'xp', -tx, 'user_id', r.user_id);
END $$;

-- ── Count one toward a challenge ─────────────────────────────────────────────
-- One row per person (and, for a team challenge, a shared row with no person)
-- per period. Answers { progress, done_now } where done_now is true only for
-- the one call that reached the target, so its reward is paid once.
CREATE OR REPLACE FUNCTION public.powers_bump_progress(
  p_company UUID, p_challenge UUID, p_user UUID, p_period TEXT, p_target INT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.powers_challenge_progress;
BEGIN
  INSERT INTO public.powers_challenge_progress (company_id, challenge_id, user_id, period, progress)
  VALUES (p_company, p_challenge, p_user, p_period, 1)
  ON CONFLICT (challenge_id, period, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET progress = public.powers_challenge_progress.progress + 1, updated_at = now()
  RETURNING * INTO r;
  IF r.completed_at IS NULL AND r.progress >= p_target THEN
    UPDATE public.powers_challenge_progress SET completed_at = now() WHERE id = r.id AND completed_at IS NULL RETURNING * INTO r;
    IF FOUND THEN RETURN jsonb_build_object('progress', r.progress, 'done_now', true); END IF;
  END IF;
  RETURN jsonb_build_object('progress', r.progress, 'done_now', false);
END $$;

-- ── Leaderboard totals ───────────────────────────────────────────────────────
-- Rewards per person between two local days (until is exclusive; null = to
-- now), totalled in the database so a month of a busy team is one small query.
-- Reversed rewards don't count. With p_user, just that person (lifetime
-- totals for achievements when p_since is far back).
CREATE OR REPLACE FUNCTION public.powers_leaderboard(p_company UUID, p_since DATE, p_until DATE DEFAULT NULL, p_user UUID DEFAULT NULL)
RETURNS TABLE (user_id UUID, xp BIGINT, coins BIGINT, resolve BIGINT, task BIGINT, job BIGINT, thanks BIGINT, feedback BIGINT, challenge BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.user_id,
         coalesce(sum(l.xp), 0)::bigint,
         coalesce(sum(greatest(l.coins, 0)), 0)::bigint,
         count(*) FILTER (WHERE l.rule = 'resolve'),
         count(*) FILTER (WHERE l.rule = 'task'),
         count(*) FILTER (WHERE l.rule = 'job'),
         count(*) FILTER (WHERE l.rule = 'thanks'),
         count(*) FILTER (WHERE l.rule = 'feedback'),
         count(*) FILTER (WHERE l.rule = 'challenge')
    FROM public.powers_ledger l
   WHERE l.company_id = p_company AND l.kind = 'reward' AND l.reversed_at IS NULL
     AND l.day >= p_since AND (p_until IS NULL OR l.day < p_until)
     AND (p_user IS NULL OR l.user_id = p_user)
   GROUP BY l.user_id
$$;

-- Server only: nobody signed in (or anonymous) can call these.
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.powers_lock_wallet(uuid, uuid)',
    'public.powers_award(uuid, uuid, int, int, text, text, text, text, text, date, int, int, uuid, text, jsonb)',
    'public.powers_buy(uuid, uuid, text, int, uuid, text, jsonb, int, int, int, timestamptz, int, text, date, int)',
    'public.powers_gift(uuid, uuid, uuid, int, text, text, date, int)',
    'public.powers_reverse(uuid, text, text, date)',
    'public.powers_bump_progress(uuid, uuid, uuid, text, int)',
    'public.powers_leaderboard(uuid, date, date, uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f); END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.powers_leaderboard(uuid, date, date, uuid);
-- DROP FUNCTION IF EXISTS public.powers_bump_progress(uuid, uuid, uuid, text, int);
-- DROP FUNCTION IF EXISTS public.powers_reverse(uuid, text, text, date);
-- DROP FUNCTION IF EXISTS public.powers_gift(uuid, uuid, uuid, int, text, text, date, int);
-- DROP FUNCTION IF EXISTS public.powers_buy(uuid, uuid, text, int, uuid, text, jsonb, int, int, int, timestamptz, int, text, date, int);
-- DROP FUNCTION IF EXISTS public.powers_award(uuid, uuid, int, int, text, text, text, text, text, date, int, int, uuid, text, jsonb);
-- DROP FUNCTION IF EXISTS public.powers_lock_wallet(uuid, uuid);
-- DROP TABLE IF EXISTS public.powers_user_achievements, public.powers_challenge_progress, public.powers_challenges,
--   public.powers_activations, public.powers_ledger, public.powers_wallets, public.powers_settings;
