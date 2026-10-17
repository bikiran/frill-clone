-- ============================================================
-- COLVY V392 — SIGN-UP BUSINESS DETAILS (super admin → Signups)
--
-- Everything a sign-up told Colvy about their business, as one JSON object
-- on signup_attempts.business (lib/signup-profile SignupBusiness):
--   name, board address (slug), industry, Google category,
--   address { formatted, line1, city, state, postcode, country },
--   source (google | map | manual), verified (picked from Google), placeId,
--   mapsUrl, hours { monday: { open, from, to, allDay? } … }, hoursSource
--   (google | default | manual), phone, website, abn, timezone, timezoneFrom,
--   utcOffsetMinutes, updatedAt.
-- Written by the sign-up routes (service role) with every code request,
-- verification and the finished sign-up. The sign-up page sends its whole
-- picture each time, so the latest edit wins (a cleared field is cleared);
-- a request without one never blanks what was recorded. The V390 columns
-- (business_name, business_slug, industry, website, business_phone,
-- business_city/state/country) are still written, for search and the list.
--
-- Access is unchanged (V390): RLS on, SELECT for the platform admin only,
-- INSERT/UPDATE/DELETE revoked from anon and authenticated (only the server
-- writes). A new column falls under the same table policies and grants.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- Any time, but best with the deploy of branch claude/signup-business-capture
-- (before or straight after): until it runs, the full details aren't kept on
-- the sign-up attempt, and running it later doesn't bring back what came in
-- meanwhile. Before it runs, nothing breaks:
--   • sign-ups still record the V390 columns (business name, board address,
--     industry, website, business phone, suburb, state, country);
--   • the CRM contact still gets the street address and postcode, and its
--     automatic "Signup lead:" note the Google place, Maps link, opening hours
--     and time zone, from the request that carries them. Later re-syncs from
--     the stored attempt (spam / not spam, Add to CRM, the CRM backfill)
--     update the note's step and mobile lines and keep those details.
-- Super admin → Signups shows whatever is there either way.
-- Needs signup_attempts (V390); skipped quietly if it doesn't exist yet.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   select email, business from signup_attempts order by last_activity_at desc limit 5;
--   A new test sign-up that picks its business on Google shows the address,
--   Maps link, "Verified via Google" and opening hours in its drawer.
--
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   ALTER TABLE signup_attempts DROP COLUMN IF EXISTS business;
--   NOTIFY pgrst, 'reload schema';
-- (The code carries on without it: the V390 columns are written as before.)
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.signup_attempts') IS NULL THEN
    RAISE NOTICE 'signup_attempts not found (run COLVY_V390_SIGNUP_ATTEMPTS.sql first): skipped';
    RETURN;
  END IF;
  ALTER TABLE signup_attempts ADD COLUMN IF NOT EXISTS business JSONB;
  -- Keep V390's lockdown as it is (re-stated so this file stands alone).
  ALTER TABLE signup_attempts ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON signup_attempts FROM anon;
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON signup_attempts FROM authenticated;
END $$;

NOTIFY pgrst, 'reload schema';
