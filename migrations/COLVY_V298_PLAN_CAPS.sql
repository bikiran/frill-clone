-- ============================================================
-- COLVY V298 — SERVER-SIDE PLAN CAPS (polls / surveys / help articles)
--
-- The feedback-suite caps were enforced only in the admin UI, so a determined
-- user scripting the Supabase client directly could exceed them. These triggers
-- enforce the same caps at the database, for EVERY insert path (UI, API, import,
-- seed) — there is no way around them.
--
-- The numbers mirror lib/plan.ts PLAN_LIMITS (kept in lockstep with the pricing
-- page). If you change a cap there, change colvy_cap() below too.
--   polls:        Free 1 · Feedback ∞ · Inbox 0 · Everything ∞ · Enterprise ∞
--   surveys:      Free 1 · Feedback ∞ · Inbox 0 · Everything ∞ · Enterprise ∞
--   helpArticles: Free 10 · Feedback ∞ · Inbox 0 · Everything ∞ · Enterprise ∞
-- (-1 = unlimited.) A trial resolves to its paid access until trial_ends_at, then
-- Free; a per-company company_entitlements.limits override wins when set.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- Stored plan value → canonical plan, honouring trial expiry (mirrors
-- lib/plan.ts normalizePlan + effectivePlan).
CREATE OR REPLACE FUNCTION colvy_effective_plan(p text, trial_ends timestamptz)
RETURNS text AS $$
  SELECT CASE lower(coalesce(p, ''))
    WHEN 'trial' THEN CASE WHEN trial_ends IS NOT NULL AND trial_ends < now() THEN 'free' ELSE 'trial' END
    WHEN 'feedback' THEN 'feedback'
    WHEN 'omnichannel' THEN 'omnichannel'
    WHEN 'everything' THEN 'everything'
    WHEN 'enterprise' THEN 'enterprise'
    WHEN 'suspended' THEN 'suspended'
    WHEN 'pro' THEN 'pro'          -- legacy full-paid (Everything-equivalent)
    WHEN 'business' THEN 'pro'
    WHEN 'growth' THEN 'pro'
    WHEN 'startup' THEN 'omnichannel'
    WHEN 'free' THEN 'free'
    ELSE 'free'
  END
$$ LANGUAGE sql STABLE;

-- Canonical plan + limit key → cap (-1 = unlimited).
CREATE OR REPLACE FUNCTION colvy_cap(plan text, key text)
RETURNS integer AS $$
  SELECT CASE key
    WHEN 'polls' THEN CASE plan
      WHEN 'free' THEN 1 WHEN 'feedback' THEN -1 WHEN 'omnichannel' THEN 0
      WHEN 'everything' THEN -1 WHEN 'pro' THEN -1 WHEN 'enterprise' THEN -1
      WHEN 'trial' THEN -1 WHEN 'suspended' THEN 0 ELSE 1 END
    WHEN 'surveys' THEN CASE plan
      WHEN 'free' THEN 1 WHEN 'feedback' THEN -1 WHEN 'omnichannel' THEN 0
      WHEN 'everything' THEN -1 WHEN 'pro' THEN -1 WHEN 'enterprise' THEN -1
      WHEN 'trial' THEN -1 WHEN 'suspended' THEN 0 ELSE 1 END
    WHEN 'helpArticles' THEN CASE plan
      WHEN 'free' THEN 10 WHEN 'feedback' THEN -1 WHEN 'omnichannel' THEN 0
      WHEN 'everything' THEN -1 WHEN 'pro' THEN -1 WHEN 'enterprise' THEN -1
      WHEN 'trial' THEN -1 WHEN 'suspended' THEN 0 ELSE 10 END
    ELSE -1
  END
$$ LANGUAGE sql IMMUTABLE;

-- Generic BEFORE INSERT guard. TG_ARGV[0] = the limit key; TG_TABLE_NAME = the
-- table to count. SECURITY DEFINER so the plan/override lookups and the count
-- are not themselves constrained by RLS.
CREATE OR REPLACE FUNCTION colvy_enforce_cap()
RETURNS trigger AS $$
DECLARE
  k    text := TG_ARGV[0];
  eff  text;
  cap  integer;
  ovr  text;
  cnt  integer;
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;

  SELECT colvy_effective_plan(c.plan, c.trial_ends_at) INTO eff
  FROM companies c WHERE c.id = NEW.company_id;
  IF eff IS NULL THEN RETURN NEW; END IF;  -- unknown company: don't block

  cap := colvy_cap(eff, k);

  -- Per-company override (super-admin comp) wins when it's a plain integer.
  SELECT (limits ->> k) INTO ovr FROM company_entitlements WHERE company_id = NEW.company_id;
  IF ovr IS NOT NULL AND ovr ~ '^[0-9]+$' THEN cap := ovr::integer; END IF;

  IF cap < 0 THEN RETURN NEW; END IF;  -- unlimited

  EXECUTE format('SELECT count(*) FROM %I WHERE company_id = $1', TG_TABLE_NAME)
    INTO cnt USING NEW.company_id;

  IF cnt >= cap THEN
    RAISE EXCEPTION 'PLAN_LIMIT: % limit reached for this plan (max %). Upgrade to add more.', k, cap
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_cap_polls ON polls;
CREATE TRIGGER trg_cap_polls BEFORE INSERT ON polls
  FOR EACH ROW EXECUTE FUNCTION colvy_enforce_cap('polls');

DROP TRIGGER IF EXISTS trg_cap_surveys ON surveys;
CREATE TRIGGER trg_cap_surveys BEFORE INSERT ON surveys
  FOR EACH ROW EXECUTE FUNCTION colvy_enforce_cap('surveys');

DROP TRIGGER IF EXISTS trg_cap_help_articles ON help_articles;
CREATE TRIGGER trg_cap_help_articles BEFORE INSERT ON help_articles
  FOR EACH ROW EXECUTE FUNCTION colvy_enforce_cap('helpArticles');

NOTIFY pgrst, 'reload schema';
