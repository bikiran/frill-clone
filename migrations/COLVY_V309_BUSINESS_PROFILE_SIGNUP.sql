-- ============================================================
-- COLVY V309 — BUSINESS PROFILE + SIGNUP VERIFICATION
--
-- Backs the redesigned multi-step signup wizard (Coax-style):
--   • business profile captured during onboarding
--   • email + SMS one-time-code verification before the account is created
--
-- On `companies`, adds the business-profile fields the wizard collects that
-- didn't already exist (website / business_address / business_phone /
-- business_mobile already exist from V118 / V137):
--   business_hours    : jsonb  — per-day opening hours, e.g.
--                                {"monday":{"open":true,"from":"09:00","to":"17:00"}, ...}
--   business_city     : text   — structured address parts from Google Places
--   business_state    : text
--   business_postcode : text
--   business_country  : text
--
-- New table `signup_verifications` holds short-lived OTP state for a signup in
-- progress. Codes are stored HASHED (sha256), never in plaintext. The row is
-- keyed by an opaque token handed to the browser; the account itself is only
-- created (in /api/auth/complete-signup) once BOTH channels are verified. RLS is
-- enabled with NO policies so the anon/auth clients can't read it at all — the
-- signup API routes reach it with the service role, which bypasses RLS.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- ── companies: business profile ─────────────────────────────
ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_hours    JSONB;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_city     TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_state    TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_postcode TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_country  TEXT;

-- ── signup_verifications: short-lived OTP state ──────────────
CREATE TABLE IF NOT EXISTS signup_verifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token          TEXT UNIQUE NOT NULL,          -- opaque handle held by the browser
  email          TEXT NOT NULL,
  phone          TEXT,
  email_code     TEXT,                          -- sha256 hash of the 6-digit code
  sms_code       TEXT,                          -- sha256 hash of the 6-digit code
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  sms_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  attempts       INT NOT NULL DEFAULT 0,        -- wrong-code attempts (lock after a few)
  last_sent_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  consumed_at    TIMESTAMPTZ,                   -- set once the account is created
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signup_verifications_token   ON signup_verifications (token);
CREATE INDEX IF NOT EXISTS idx_signup_verifications_email   ON signup_verifications (lower(email));
CREATE INDEX IF NOT EXISTS idx_signup_verifications_expires ON signup_verifications (expires_at);

-- Deny-by-default: enable RLS and add no policies, so only the service role
-- (used by the signup API routes) can touch these rows.
ALTER TABLE signup_verifications ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
