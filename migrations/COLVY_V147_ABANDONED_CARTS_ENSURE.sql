-- ============================================================
-- COLVY V147 — ABANDONED CARTS: ensure tables exist (+ diag error)
-- Consolidates the abandoned_carts table (originally V136) and the
-- hit log (V146), and adds save_error for diagnostics. Run this if
-- carts POST successfully but saved_carts stays 0 — that means the
-- abandoned_carts table was never created. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS abandoned_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  external_id TEXT,
  name TEXT,
  email TEXT,
  phone TEXT,
  address JSONB,
  items JSONB DEFAULT '[]',
  coupon TEXT,
  shipping JSONB,
  notes TEXT,
  subtotal NUMERIC,
  total NUMERIC,
  currency TEXT DEFAULT 'AUD',
  cart_url TEXT,
  status TEXT DEFAULT 'abandoned',        -- abandoned | recovered | dismissed
  conversation_id UUID,
  recovered_order_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill any columns that might be missing on an older table.
ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS address JSONB;
ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';
ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS coupon TEXT;
ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS shipping JSONB;
ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS subtotal NUMERIC;
ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS total NUMERIC;
ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'AUD';
ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS cart_url TEXT;
ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'abandoned';
ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS conversation_id UUID;
ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS recovered_order_id TEXT;
ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_abandoned_company ON abandoned_carts(company_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS abandoned_ext_uniq ON abandoned_carts(company_id, external_id) WHERE external_id IS NOT NULL;

ALTER TABLE abandoned_carts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage abandoned_carts" ON abandoned_carts;
CREATE POLICY "Anyone can manage abandoned_carts" ON abandoned_carts FOR ALL USING (true);

-- Hit log (diagnostics) + save_error column.
CREATE TABLE IF NOT EXISTS abandoned_cart_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  had_email BOOLEAN DEFAULT false,
  had_phone BOOLEAN DEFAULT false,
  item_count INT DEFAULT 0,
  raw_keys TEXT,
  save_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE abandoned_cart_hits ADD COLUMN IF NOT EXISTS save_error TEXT;
CREATE INDEX IF NOT EXISTS idx_ac_hits_company ON abandoned_cart_hits(company_id, created_at DESC);
ALTER TABLE abandoned_cart_hits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage ac_hits" ON abandoned_cart_hits;
CREATE POLICY "Anyone can manage ac_hits" ON abandoned_cart_hits FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
