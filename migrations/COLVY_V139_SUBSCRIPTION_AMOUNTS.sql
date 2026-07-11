-- ============================================================
-- COLVY V139 — SUBSCRIPTION AMOUNTS (for real MRR)
-- Store the actual Stripe amount + interval on each subscription so
-- MRR is computed from real billed amounts, not a plan→price guess.
-- Safe to re-run.
-- ============================================================

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS amount_cents BIGINT DEFAULT 0;   -- billed amount in cents
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'aud';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_interval TEXT DEFAULT 'month'; -- month | year
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
