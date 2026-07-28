-- ============================================================
-- COLVY V119 — IN-CHAT POLLS/SURVEYS/FORMS, STRIPE PAYMENTS,
-- AUTO-REPLY.
--
-- ⚠️ RUN THIS ONE STEP AT A TIME (not all at once).
-- The ALTER TABLEs below touch busy tables (messages, companies,
-- conversations). Running them all in a single transaction against
-- a live app causes lock deadlocks. Select each STEP block, run it,
-- wait for success, then run the next. Each sets a short lock_timeout
-- so if a lock is briefly held it fails fast — just re-run that step.
-- All steps are idempotent (safe to re-run).
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- STEP 1 — messages: interactive message columns
-- ─────────────────────────────────────────────────────────────
SET lock_timeout = '4s';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_payload JSONB;


-- ─────────────────────────────────────────────────────────────
-- STEP 2 — conversations: auto-reply tracking flags
-- ─────────────────────────────────────────────────────────────
SET lock_timeout = '4s';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS auto_replied BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS contact_info_requested BOOLEAN DEFAULT false;


-- ─────────────────────────────────────────────────────────────
-- STEP 3 — companies: Stripe Connect + auto-reply settings
-- ─────────────────────────────────────────────────────────────
SET lock_timeout = '4s';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_connected BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN DEFAULT true;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS auto_reply_message TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS request_contact_info BOOLEAN DEFAULT true;


-- ─────────────────────────────────────────────────────────────
-- STEP 4 — chat_interactions table (new, no lock contention)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  conversation_id UUID,
  message_id UUID,
  kind TEXT,
  ref_id UUID,
  respondent TEXT,
  response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_interactions ON chat_interactions(conversation_id);
ALTER TABLE chat_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage chat_interactions" ON chat_interactions;
CREATE POLICY "Anyone can manage chat_interactions" ON chat_interactions FOR ALL USING (true);


-- ─────────────────────────────────────────────────────────────
-- STEP 5 — chat_payments table (new, no lock contention)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  conversation_id UUID,
  message_id UUID,
  amount_cents INT NOT NULL,
  currency TEXT DEFAULT 'aud',
  description TEXT,
  status TEXT DEFAULT 'pending',
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


-- ─────────────────────────────────────────────────────────────
-- STEP 6 — reload PostgREST schema cache
-- ─────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
