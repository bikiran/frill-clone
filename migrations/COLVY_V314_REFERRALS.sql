-- ============================================================
-- COLVY V314 — Referral program backend
--
-- Referrer earns $100 Colvy ACCOUNT CREDIT once a referred business subscribes
-- and pays its FIRST month. Pieces:
--   companies.referral_code : the referrer's stable code (their /signup?ref= link)
--   referrals               : one row per referred company (pending → qualified)
--   account_credits         : the Colvy account-credit ledger (balance = SUM)
--
-- The $100 is recorded here as account credit (source of truth) and, when the
-- referrer has a Stripe customer, also pushed to their Stripe balance so it nets
-- off their next invoice. Balance for a company = SUM(account_credits.amount_cents).
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- Each company gets a stable referral code for its share link.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS referral_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS companies_referral_code_idx ON companies (referral_code) WHERE referral_code IS NOT NULL;

-- One referral per referred company.
CREATE TABLE IF NOT EXISTS referrals (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code             TEXT NOT NULL,
  referrer_company_id  UUID,
  referrer_user_id     UUID,
  referred_company_id  UUID,
  referred_user_id     UUID,
  referred_email       TEXT,
  referred_name        TEXT,
  status               TEXT NOT NULL DEFAULT 'pending',  -- pending | qualified | reversed
  credit_cents         INTEGER NOT NULL DEFAULT 10000,
  currency             TEXT NOT NULL DEFAULT 'aud',
  first_invoice_id     TEXT,
  qualified_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_company_id);
CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_unique ON referrals (referred_company_id);
CREATE INDEX IF NOT EXISTS referrals_referred_user_idx ON referrals (referred_user_id);

-- Colvy account-credit ledger. Positive amount = credit granted to the company.
CREATE TABLE IF NOT EXISTS account_credits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'aud',
  reason       TEXT,
  referral_id  UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_credits_company_idx ON account_credits (company_id);
-- One credit row per referral (idempotent crediting).
CREATE UNIQUE INDEX IF NOT EXISTS account_credits_referral_unique ON account_credits (referral_id) WHERE referral_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
