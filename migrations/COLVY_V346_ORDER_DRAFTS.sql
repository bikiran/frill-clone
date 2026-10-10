-- ============================================================
-- COLVY V346 — ORDER DRAFTS
--
-- Create Order's "Save as draft" now keeps the whole half-built order in
-- Colvy (customer, items, discounts, shipping, notes), so anyone on the team
-- can reopen it from Orders → Drafts, edit it and create the real order
-- later. Nothing is sent to the store until the order is created.
--
-- Team members of the workspace only (is_company_member). Run in the Supabase
-- SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS order_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id UUID,
  conversation_id UUID,
  customer_name TEXT,
  customer_email TEXT,
  item_count INTEGER DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_by_name TEXT,
  updated_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_drafts_company ON order_drafts(company_id, updated_at DESC);

ALTER TABLE order_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_drafts_members ON order_drafts;
CREATE POLICY order_drafts_members ON order_drafts FOR ALL
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));
