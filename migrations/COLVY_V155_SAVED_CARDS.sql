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

-- The in-chat payments table is chat_payments (NOT "payments"). Ensure it
-- exists with everything the app writes, then add the saved-card columns.
CREATE TABLE IF NOT EXISTS chat_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  conversation_id UUID,
  message_id UUID,
  amount_cents INT NOT NULL,
  currency TEXT DEFAULT 'aud',
  description TEXT,
  status TEXT DEFAULT 'pending',       -- pending | paid | failed | refunded
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  checkout_url TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill any columns missing on an existing chat_payments table.
ALTER TABLE chat_payments ADD COLUMN IF NOT EXISTS message_id UUID;
ALTER TABLE chat_payments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE chat_payments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE chat_payments ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
ALTER TABLE chat_payments ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE chat_payments ADD COLUMN IF NOT EXISTS checkout_url TEXT;
ALTER TABLE chat_payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- How the charge was made.
ALTER TABLE chat_payments ADD COLUMN IF NOT EXISTS payment_method TEXT;  -- 'link' | 'saved_card'
ALTER TABLE chat_payments ADD COLUMN IF NOT EXISTS saved_card_id UUID;

CREATE INDEX IF NOT EXISTS idx_chat_payments_conv ON chat_payments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_payments_status ON chat_payments(company_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_payments_session ON chat_payments(stripe_session_id);

ALTER TABLE chat_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage chat_payments" ON chat_payments;
CREATE POLICY "Anyone can manage chat_payments" ON chat_payments FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
