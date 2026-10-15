-- ============================================================
-- COLVY V373 — PAID NUMBER CHECKOUTS
--
-- "Get a business number" sends the ID details, then Stripe checkout, and the
-- number is bought after payment (the calls page's finalize call, or the
-- Stripe webhook). Nothing was recorded until the number was live, so the
-- setup checklist couldn't tell "paid, setting up your number" or "paid, but
-- it didn't set up" from a checkout that was never finished, and offered a
-- paying customer "Get a number" again.
--
-- One row per paid checkout session (lib/number-orders):
--   provisioning  paid, the number is being bought
--   active        the number is live
--   failed        buying it didn't work (the payment is safe; finalize can
--                 be run again for the same checkout)
--
-- Until this runs, nothing is recorded and setup reads as before.
--
-- Server only (service role): RLS on, no policies, so nobody reads it with
-- the public key. Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS number_orders (
  stripe_session_id TEXT PRIMARY KEY,           -- the paid Checkout Session (cs_…)
  company_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'twilio',      -- twilio | telnyx
  status TEXT NOT NULL DEFAULT 'provisioning',  -- provisioning | active | failed
  phone_number TEXT,                            -- once it's live
  error TEXT,                                   -- why it failed, when it did
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_number_orders_company ON number_orders(company_id, created_at DESC);
ALTER TABLE number_orders ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
