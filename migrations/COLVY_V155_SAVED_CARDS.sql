-- ============================================================
-- COLVY V155 — SAVED CARDS (save card on file, charge later)
-- Lets a business save a customer's card (with their consent, via Stripe)
-- and charge it later from the chat without asking again.
-- Card data NEVER touches Colvy — Stripe stores it; we keep only the
-- Stripe customer id, payment-method id and the last 4 digits.
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS saved_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  contact_id UUID,
  stripe_customer_id TEXT NOT NULL,
  stripe_payment_method_id TEXT NOT NULL,
  brand TEXT,          -- visa, mastercard…
  last4 TEXT,
  exp_month INT,
  exp_year INT,
  is_default BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS saved_cards_pm_uniq
  ON saved_cards (company_id, stripe_payment_method_id);
CREATE INDEX IF NOT EXISTS idx_saved_cards_contact
  ON saved_cards (company_id, contact_id);
ALTER TABLE saved_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage saved_cards" ON saved_cards;
CREATE POLICY "Anyone can manage saved_cards" ON saved_cards FOR ALL USING (true);

-- Track the Stripe customer against a contact so repeat charges reuse it.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Payments: record how the charge was made.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method TEXT;  -- 'link' | 'saved_card'
ALTER TABLE payments ADD COLUMN IF NOT EXISTS saved_card_id UUID;

NOTIFY pgrst, 'reload schema';
