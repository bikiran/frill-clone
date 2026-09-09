-- ============================================================
-- COLVY V296 — PAYMENT METHODS (managed palette)
--
-- A per-company list of payment methods (Bank transfer, Cash, Card, …) so the
-- Record Sale flow can offer a searchable Select + a "Manage payment methods"
-- dialog (create / rename / delete), the same way Order Tags work — instead of a
-- free-text field. The method actually stored on a sale still lives in
-- conversation_sales.payment_method by NAME; this table is the managed source of
-- suggestions.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_methods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
-- One method name per company (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_methods_company_name ON payment_methods (company_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_payment_methods_company ON payment_methods (company_id);

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage payment_methods" ON payment_methods;
CREATE POLICY "Anyone can manage payment_methods" ON payment_methods FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
