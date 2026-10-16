-- ============================================================
-- COLVY V391 — SIGN-UP CODE TRIES PER CHANNEL
--
-- /api/auth/otp/verify allows 5 tries per channel for each sign-up. Until
-- now one `attempts` counter covered both the email and the mobile code, and
-- every resend set it back to 0. This adds a counter per channel:
--   email_attempts, sms_attempts  (tries taken, never reset by a resend;
--                                  a fresh sign-up is a new row at 0)
-- The route reserves a try with a compare-and-swap UPDATE before comparing
-- the code, so parallel requests can't get extra tries.
--
-- Access is unchanged: signup_verifications has RLS on and no policies
-- (V309), so only the server (service role) reads or writes it.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- Any time, before or after deploying branch claude/signup-sms. Before it
-- runs, the route counts tries on the shared `attempts` column instead (still
-- atomic, still never reset by a resend, 5 tries for both codes together).
-- Skipped quietly if signup_verifications (V309) doesn't exist.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   select email_attempts, sms_attempts from signup_verifications limit 1;
--
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   ALTER TABLE signup_verifications DROP COLUMN IF EXISTS email_attempts;
--   ALTER TABLE signup_verifications DROP COLUMN IF EXISTS sms_attempts;
--   NOTIFY pgrst, 'reload schema';
-- (The route falls back to `attempts` on its own.)
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.signup_verifications') IS NULL THEN
    RAISE NOTICE 'signup_verifications not found (run V309 first): skipped';
    RETURN;
  END IF;
  ALTER TABLE signup_verifications ADD COLUMN IF NOT EXISTS email_attempts INT NOT NULL DEFAULT 0;
  ALTER TABLE signup_verifications ADD COLUMN IF NOT EXISTS sms_attempts   INT NOT NULL DEFAULT 0;
  -- Rows in progress keep what they've used: their shared count applies to both.
  UPDATE signup_verifications
     SET email_attempts = GREATEST(email_attempts, attempts),
         sms_attempts   = GREATEST(sms_attempts, attempts)
   WHERE consumed_at IS NULL AND attempts > 0;
  ALTER TABLE signup_verifications ENABLE ROW LEVEL SECURITY;
END $$;

NOTIFY pgrst, 'reload schema';
