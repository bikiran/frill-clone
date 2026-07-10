-- ============================================================
-- COLVY V119 — IN-CHAT POLLS/SURVEYS/FORMS, STRIPE PAYMENTS,
-- AUTO-REPLY. Safe to run multiple times.
-- ============================================================

-- Interactive message support on messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text'; -- text | poll | survey | form | payment | system
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_payload JSONB;            -- interactive data (poll ref, amount, etc.)

-- Responses to in-chat interactive messages (poll votes, form answers, survey)
CREATE TABLE IF NOT EXISTS chat_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  conversation_id UUID,
  message_id UUID,
  kind TEXT,                    -- poll | survey | form
  ref_id UUID,                  -- poll/survey/form id
  respondent TEXT,              -- visitor name/email
  response JSONB,               -- the answer payload
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_interactions ON chat_interactions(conversation_id);
ALTER TABLE chat_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage chat_interactions" ON chat_interactions;
CREATE POLICY "Anyone can manage chat_interactions" ON chat_interactions FOR ALL USING (true);

-- In-chat payments / invoices (Stripe)
CREATE TABLE IF NOT EXISTS chat_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  conversation_id UUID,
  message_id UUID,
  amount_cents INT NOT NULL,
  currency TEXT DEFAULT 'aud',
  description TEXT,
  status TEXT DEFAULT 'pending',   -- pending | paid | cancelled | failed
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  checkout_url TEXT,
  receipt_url TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_payments ON chat_payments(conversation_id);
ALTER TABLE chat_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage chat_payments" ON chat_payments;
CREATE POLICY "Anyone can manage chat_payments" ON chat_payments FOR ALL USING (true);

-- Stripe Connect + auto-reply settings on companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_connected BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN DEFAULT true;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS auto_reply_message TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS request_contact_info BOOLEAN DEFAULT true;

-- Track that we've already auto-replied to a conversation (avoid duplicates)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS auto_replied BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS contact_info_requested BOOLEAN DEFAULT false;

NOTIFY pgrst, 'reload schema';
