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
-- It's also the lock that makes a paid checkout buy exactly one number: the
-- calls page's finalize call and the Stripe webhook both provision it, often
-- at the same moment. Each claims the row first (an insert the primary key
-- lets only one through, or a conditional update — the V362 pattern), and
-- only the claimant buys.
--
-- One row per paid checkout session (lib/number-orders):
--   provisioning  claimed: the number is being bought (by claimed_by)
--   active        the number is live
--   failed        buying it didn't work (the payment is safe; the next try
--                 claims it again)
--   cancelled     its subscription was cancelled (refunded) before a number
--                 was bought; nothing more is bought for it
-- A claim still "provisioning" after 15 minutes is taken over: its holder died.
--
-- Until this runs, nothing is recorded, there's no lock (the routes check
-- what provisioning wrote, as before), and setup reads as before.
--
-- Server only (service role): RLS on, no policies, so nobody reads it with
-- the public key. Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS number_orders (
  stripe_session_id TEXT PRIMARY KEY,           -- the paid Checkout Session (cs_…)
  company_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'twilio',      -- twilio | telnyx
  status TEXT NOT NULL DEFAULT 'provisioning',  -- provisioning | active | failed | cancelled
  claimed_by TEXT,                              -- the call that holds the claim
  phone_number TEXT,                            -- once it's live
  error TEXT,                                   -- why it failed, when it did
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE number_orders ADD COLUMN IF NOT EXISTS claimed_by TEXT;
CREATE INDEX IF NOT EXISTS idx_number_orders_company ON number_orders(company_id, created_at DESC);
ALTER TABLE number_orders ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
