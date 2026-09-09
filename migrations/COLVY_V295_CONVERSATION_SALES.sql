-- ============================================================
-- COLVY V295 — CONVERSATION SALES (attributed revenue)
--
-- Records a sale attributed to a conversation/agent, so a workspace can see the
-- revenue Colvy helped generate — including bank-transfer / off-Stripe sales
-- that only ever show up in the chat. A conversation can have many sales.
--
-- Run the whole file in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS conversation_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  conversation_id UUID,               -- the chat this sale is credited to
  contact_id UUID,                    -- the customer, when known
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'AUD',
  payment_method TEXT,                -- 'Bank transfer' | 'Card' | 'Cash' | free text
  sold_by_user_id UUID,               -- team member credited with the sale
  sold_by_name TEXT,
  recorded_by_user_id UUID,           -- who logged it (may differ from sold_by)
  recorded_by_name TEXT,
  note TEXT,
  sale_at TIMESTAMPTZ DEFAULT NOW(),  -- when the sale happened (editable)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_sales_company ON conversation_sales(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_sales_conversation ON conversation_sales(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sales_sold_by ON conversation_sales(company_id, sold_by_user_id);

ALTER TABLE conversation_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage conversation_sales" ON conversation_sales;
CREATE POLICY "Anyone can manage conversation_sales" ON conversation_sales FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
