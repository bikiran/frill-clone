-- ============================================================
-- COLVY V164 — AI AGENT (knowledge, capabilities, guardrails)
--
-- The AI answers customers using ONLY the business's own material (ideas,
-- roadmap, announcements, help articles, website, past chats). It can be
-- allowed to take a few actions, each behind a hard limit that is enforced
-- SERVER-SIDE — never by the model. A model can be talked into anything;
-- the limits below cannot.
--
-- Safe to re-run.
-- ============================================================

-- ── AI settings per company ────────────────────────────────────────────────
ALTER TABLE companies ADD COLUMN IF NOT EXISTS ai_settings JSONB DEFAULT '{}'::jsonb;
-- {
--   enabled: false,
--   auto_reply: false,                -- answer without a human
--   handoff_after: 3,                 -- give up and fetch a human after N turns
--   tone: 'friendly',
--   knowledge: { ideas, roadmap, announcements, help, website, past_chats },
--   capabilities: {
--     coupon:      { enabled, max_percent, max_amount_cents, per_customer_limit, expires_days },
--     doa_claim:   { enabled },
--     create_order:{ enabled, max_order_cents, require_human_approval }
--   }
-- }

-- ── What the AI has learned (the company's own material, chunked) ──────────
CREATE TABLE IF NOT EXISTS ai_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  source TEXT NOT NULL,              -- idea | roadmap | announcement | help | website | chat
  source_id TEXT,                    -- id of the original row/page
  title TEXT,
  content TEXT NOT NULL,
  url TEXT,
  indexed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_company ON ai_knowledge (company_id, source);
CREATE UNIQUE INDEX IF NOT EXISTS ai_knowledge_uniq
  ON ai_knowledge (company_id, source, source_id) WHERE source_id IS NOT NULL;
ALTER TABLE ai_knowledge ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage ai_knowledge" ON ai_knowledge;
CREATE POLICY "Anyone can manage ai_knowledge" ON ai_knowledge FOR ALL USING (true);

-- ── Every AI action, recorded. Nothing the AI does is invisible. ───────────
CREATE TABLE IF NOT EXISTS ai_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  conversation_id UUID,
  contact_id UUID,
  action TEXT NOT NULL,              -- coupon | doa_claim | draft_order | handoff | reply
  payload JSONB,
  -- Guardrails: what the AI asked for vs what it was actually allowed.
  requested JSONB,
  allowed BOOLEAN DEFAULT true,
  blocked_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_actions_company ON ai_actions (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_actions_conv ON ai_actions (conversation_id);
ALTER TABLE ai_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage ai_actions" ON ai_actions;
CREATE POLICY "Anyone can manage ai_actions" ON ai_actions FOR ALL USING (true);

-- Coupons the AI issued — so per-customer limits can actually be enforced.
CREATE TABLE IF NOT EXISTS ai_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  conversation_id UUID,
  contact_id UUID,
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL,       -- percent | fixed_cart
  amount NUMERIC NOT NULL,
  expires_at TIMESTAMPTZ,
  woo_coupon_id BIGINT,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_coupons_contact ON ai_coupons (company_id, contact_id);
ALTER TABLE ai_coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage ai_coupons" ON ai_coupons;
CREATE POLICY "Anyone can manage ai_coupons" ON ai_coupons FOR ALL USING (true);

-- Mark AI-written messages so the customer is never misled about who replied.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_ai BOOLEAN DEFAULT false;

NOTIFY pgrst, 'reload schema';
