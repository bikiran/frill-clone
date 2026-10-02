-- COLVY_V321_STOCK_WAITLIST
-- "Notify me when it arrives" — back-in-stock waitlists.
--
-- A customer asks for something that isn't in stock (often a livestock species
-- that arrives weekly). The team adds them to a waitlist for that product — or a
-- free-text item that isn't listed online — and the moment it's back in stock
-- (WooCommerce stock update, or the team pressing "Notify now") everyone waiting
-- gets one SMS. Idempotent.

CREATE TABLE IF NOT EXISTS stock_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  contact_id UUID,
  conversation_id UUID,
  woo_product_id BIGINT,                 -- null for a free-text item not listed online
  item_name TEXT NOT NULL,               -- product name, or what the customer asked for
  item_image TEXT,
  item_url TEXT,                         -- product page link included in the SMS
  customer_name TEXT,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'waiting', -- waiting | queued | notified | cancelled | failed
  source TEXT DEFAULT 'manual',          -- manual | inbox | widget
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  queued_at TIMESTAMPTZ,                 -- arrived outside sending hours → sent at next window
  notified_at TIMESTAMPTZ,
  notified_via TEXT,                     -- sms | email
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_waitlist_company_status ON stock_waitlist(company_id, status);
CREATE INDEX IF NOT EXISTS idx_waitlist_company_product ON stock_waitlist(company_id, woo_product_id);

-- One open entry per customer per item, so adding someone twice is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_waitlist_open_entry ON stock_waitlist (
  company_id,
  COALESCE(contact_id::text, phone, email),
  COALESCE(woo_product_id::text, lower(item_name))
) WHERE status IN ('waiting', 'queued');

-- RLS on with NO policies: the table holds customers' phone numbers, so the
-- browser (anon key) can't touch it at all. Everything goes through the
-- company-gated /api/waitlist routes, which use the service-role key.
ALTER TABLE stock_waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role manages stock_waitlist" ON stock_waitlist;

-- Per-company settings: auto-notify on/off, the SMS template, timezone.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS waitlist_settings JSONB DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
