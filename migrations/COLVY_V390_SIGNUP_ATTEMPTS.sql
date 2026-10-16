-- ============================================================
-- COLVY V390 — SIGN-UP ATTEMPTS (super admin → Signups)
--
-- One row per email that started signing up for Colvy: what the wizard knew
-- when the first code was sent (name, business, industry, mobile), where they
-- came from (referrer, UTM), rough location from Vercel's edge headers,
-- device, a timeline (each code sent, wrong codes, each step verified, the
-- account created), simple risk signals, and admin actions (spam, emailed).
-- The verification codes themselves are never stored here.
--
-- Written by the sign-up API routes (/api/auth/otp/send, /api/auth/otp/verify,
-- /api/auth/complete-signup) and the platform-admin routes, all with the
-- service role. Read in super admin → Signups (/api/platform-admin/signups).
--
-- Access:
--   • SELECT — the platform admin only (is_platform_admin()). Nobody else.
--   • INSERT / UPDATE / DELETE — no policy and the privileges are revoked
--     from anon and authenticated: only the server (service role) writes.
--   • signup_rate_windows / signup_rate_claim(): the service role only.
--
-- Retention: /api/cron/signup-retention (daily) deletes abandoned rows that
-- weren't suspicious or marked spam after 180 days quiet,
-- signup_verifications rows older than 180 days, and rate counters older
-- than two days.
--
-- It also copies earlier sign-ups from signup_verifications (V309) so the
-- Signups page starts with history: one row per email, with the mobile, the
-- first and latest code times, whether each channel was verified and whether
-- an account was made. Only emails that don't have a row yet are copied.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- Any time, before or after deploying branch claude/signup-leads. Before it
-- runs, sign-up works exactly as before (recording is skipped), the hourly
-- limits are kept per server instance (plus fresh sign-ups per email from
-- signup_verifications) instead of by signup_rate_claim(), and the Signups page
-- shows the earlier sign-ups from signup_verifications with a notice.
-- Needs signup_verifications (V309) only for the history copy; skipped if
-- it's missing.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. Signed out (anon key):   select * from signup_attempts;   → permission denied
--      Signed in as a business: select * from signup_attempts;   → no rows
--   2. Super admin → Signups lists earlier sign-ups; a new test sign-up shows
--      "Code sent" within seconds of the first code.
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- Same body as V351 / V364 / V375 / V387, so this file stands alone.
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT lower(COALESCE(auth.jwt() ->> 'email', '')) = 'bishalstha76@gmail.com'
$$;
REVOKE ALL ON FUNCTION is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated, service_role;

-- ── STEP 1: the table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signup_attempts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT NOT NULL,                 -- lower-cased
  email_domain        TEXT,
  name                TEXT,
  business_name       TEXT,
  business_slug       TEXT,
  industry            TEXT,
  website             TEXT,
  business_phone      TEXT,
  business_city       TEXT,
  business_state      TEXT,
  business_country    TEXT,
  phone               TEXT,                          -- the mobile codes were texted to
  phone_country       TEXT,
  source              TEXT DEFAULT 'web',
  referrer            TEXT,
  landing_path        TEXT,
  utm                 JSONB,
  plan                TEXT,
  ref_code            TEXT,
  ip                  TEXT,
  ip_country          TEXT,
  ip_region           TEXT,
  ip_city             TEXT,
  user_agent          TEXT,
  device              TEXT,
  os                  TEXT,
  browser             TEXT,
  stage               TEXT,                          -- code_sent | email_verified | mobile_verified | account_created
  step_reached        INT,                           -- wizard step (5–7), 8 = account created
  codes_sent          INT NOT NULL DEFAULT 0,
  wrong_codes         INT NOT NULL DEFAULT 0,
  first_code_at       TIMESTAMPTZ,
  last_code_at        TIMESTAMPTZ,
  email_verified_at   TIMESTAMPTZ,
  mobile_verified_at  TIMESTAMPTZ,
  account_created_at  TIMESTAMPTZ,
  user_id             UUID,
  company_id          UUID,
  company_slug        TEXT,
  ip_email_count      INT,
  risk_score          INT NOT NULL DEFAULT 0,
  risk_reasons        TEXT[] NOT NULL DEFAULT '{}',
  spam_at             TIMESTAMPTZ,
  spam_by             TEXT,
  contact_id          UUID,                          -- the contact in Colvy's own workspace
  contact_synced_at   TIMESTAMPTZ,
  events              JSONB NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS signup_attempts_email_uniq ON signup_attempts (email);
CREATE INDEX IF NOT EXISTS idx_signup_attempts_activity ON signup_attempts (last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_signup_attempts_ip ON signup_attempts (ip, last_activity_at DESC) WHERE ip IS NOT NULL;

-- ── STEP 2: access ──────────────────────────────────────────────────────────
ALTER TABLE signup_attempts ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signup_attempts' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON signup_attempts', r.policyname);
  END LOOP;
END $$;
CREATE POLICY "signup_attempts platform admin read" ON signup_attempts
  FOR SELECT TO authenticated USING (is_platform_admin());
REVOKE ALL ON signup_attempts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON signup_attempts FROM authenticated;
GRANT SELECT ON signup_attempts TO authenticated;
GRANT ALL ON signup_attempts TO service_role;

-- ── STEP 2b: code-send limits ───────────────────────────────────────────────
-- Hourly counters for /api/auth/otp/send, one row per key:
--   e:<email>:email, e:<email>:sms (codes per channel), ip:<address> (requests).
-- signup_rate_claim() locks the keys, resets any whose hour is up, and either
-- refuses (returning the first key over its limit) or adds one to every key,
-- all in one call, so parallel requests can't slip past the limit.
CREATE TABLE IF NOT EXISTS signup_rate_windows (
  key           TEXT PRIMARY KEY,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hits          INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_signup_rate_windows_start ON signup_rate_windows (window_start);
ALTER TABLE signup_rate_windows ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signup_rate_windows' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON signup_rate_windows', r.policyname);
  END LOOP;
END $$;
REVOKE ALL ON signup_rate_windows FROM anon, authenticated;
GRANT ALL ON signup_rate_windows TO service_role;

CREATE OR REPLACE FUNCTION signup_rate_claim(p_keys TEXT[], p_limits INT[], p_window_secs INT DEFAULT 3600)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  i INT;
  n INT := COALESCE(array_length(p_keys, 1), 0);
  cur INT;
  cutoff TIMESTAMPTZ := now() - make_interval(secs => p_window_secs);
BEGIN
  IF n = 0 THEN RETURN NULL; END IF;
  INSERT INTO signup_rate_windows (key, window_start, hits)
    SELECT DISTINCT k, now(), 0 FROM unnest(p_keys) AS k
    ON CONFLICT (key) DO NOTHING;
  -- Lock in a fixed order so two requests sharing keys can't deadlock.
  PERFORM 1 FROM signup_rate_windows WHERE key = ANY(p_keys) ORDER BY key FOR UPDATE;
  UPDATE signup_rate_windows SET window_start = now(), hits = 0 WHERE key = ANY(p_keys) AND window_start < cutoff;
  FOR i IN 1..n LOOP
    SELECT hits INTO cur FROM signup_rate_windows WHERE key = p_keys[i];
    IF cur + 1 > p_limits[i] THEN RETURN p_keys[i]; END IF;
  END LOOP;
  UPDATE signup_rate_windows SET hits = hits + 1 WHERE key = ANY(p_keys);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION signup_rate_claim(TEXT[], INT[], INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION signup_rate_claim(TEXT[], INT[], INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION signup_rate_claim(TEXT[], INT[], INT) TO service_role;

-- ── STEP 3: history from signup_verifications ───────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.signup_verifications') IS NULL THEN
    RAISE NOTICE 'signup_verifications does not exist: no history to copy';
    RETURN;
  END IF;
  INSERT INTO signup_attempts (
    email, email_domain, phone, codes_sent, wrong_codes, first_code_at, last_code_at,
    email_verified_at, mobile_verified_at, account_created_at, stage, step_reached,
    events, first_seen_at, last_activity_at, source
  )
  SELECT
    v.email,
    split_part(v.email, '@', 2),
    (array_agg(v.phone ORDER BY v.created_at DESC) FILTER (WHERE v.phone IS NOT NULL))[1],
    count(*)::int,
    COALESCE(sum(v.attempts), 0)::int,
    min(v.created_at),
    max(v.last_sent_at),
    max(v.last_sent_at) FILTER (WHERE v.email_verified),
    max(v.last_sent_at) FILTER (WHERE v.sms_verified),
    max(v.consumed_at),
    CASE WHEN bool_or(v.consumed_at IS NOT NULL) THEN 'account_created'
         WHEN bool_or(v.sms_verified) THEN 'mobile_verified'
         WHEN bool_or(v.email_verified) THEN 'email_verified'
         ELSE 'code_sent' END,
    CASE WHEN bool_or(v.consumed_at IS NOT NULL) THEN 8
         WHEN bool_or(v.sms_verified) THEN 7
         WHEN bool_or(v.email_verified) THEN 6
         ELSE 5 END,
    COALESCE(jsonb_agg(jsonb_build_object('at', v.created_at, 'type', 'code_sent', 'channel', 'both', 'detail', 'Copied from earlier sign-ups') ORDER BY v.created_at), '[]'::jsonb),
    min(v.created_at),
    GREATEST(max(v.last_sent_at), COALESCE(max(v.consumed_at), max(v.last_sent_at))),
    'web'
  FROM (SELECT lower(email) AS email, phone, attempts, created_at, last_sent_at, consumed_at, email_verified, sms_verified FROM signup_verifications) v
  WHERE v.email LIKE '%@%'
  GROUP BY v.email
  ON CONFLICT (email) DO NOTHING;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS signup_rate_claim(TEXT[], INT[], INT);
--   DROP TABLE IF EXISTS signup_rate_windows;
--   DROP TABLE IF EXISTS signup_attempts;
-- (The code carries on without it: recording is skipped and the Signups page
--  falls back to signup_verifications.)
