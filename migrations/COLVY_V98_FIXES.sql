-- ============================================================
-- COLVY V98 FIXES MIGRATION
-- Run this in the Supabase SQL editor (project: mtfhctgdayeqrguodksv)
-- Safe to run multiple times.
-- ============================================================

-- IDEAS.PRIORITY: the live column is INTEGER in some databases, but the app
-- saves preset keys like 'low' / 'medium' / 'high' / 'quick_wins'.
-- That mismatch causes: invalid input syntax for type integer: "low".
-- Convert to TEXT, mapping any old numeric values onto the preset keys.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ideas' AND column_name = 'priority'
      AND data_type IN ('integer', 'bigint', 'smallint', 'numeric')
  ) THEN
    ALTER TABLE ideas ALTER COLUMN priority DROP DEFAULT;
    ALTER TABLE ideas ALTER COLUMN priority TYPE TEXT USING (
      CASE priority::text
        WHEN '1' THEN 'low'
        WHEN '2' THEN 'medium'
        WHEN '3' THEN 'high'
        WHEN '4' THEN 'quick_wins'
        ELSE NULL
      END
    );
  END IF;
END $$;

-- Ensure the column exists as TEXT for fresh databases too
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS priority TEXT;

-- Done.

-- VOTES: store the voter's display name + avatar at vote time so the idea
-- detail view can show real profile icons instead of generic tick marks.
ALTER TABLE votes ADD COLUMN IF NOT EXISTS user_name TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS user_avatar TEXT;

-- FORM RESPONSES: add metadata columns for geo/device detection
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS screen_width INTEGER;
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS screen_height INTEGER;
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS response_time_seconds INTEGER;
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS referrer TEXT;

-- WOOCOMMERCE ORDERS: table for storing individual order history
CREATE TABLE IF NOT EXISTS woocommerce_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  woo_order_id INTEGER,
  woo_customer_id INTEGER,
  customer_email TEXT,
  status TEXT,
  total NUMERIC(10,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  order_date TIMESTAMPTZ,
  line_items JSONB DEFAULT '[]',
  billing JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, woo_order_id)
);
CREATE INDEX IF NOT EXISTS idx_woo_orders_customer ON woocommerce_orders(company_id, woo_customer_id);

-- WIDGET ANALYTICS: ensure created_at exists (the API previously only wrote a 'timestamp' column
-- which doesn't exist on the DB table — so we just add created_at with a default)
ALTER TABLE widget_analytics ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- COMMENTS: store display name at post time
ALTER TABLE comments ADD COLUMN IF NOT EXISTS user_name TEXT;
