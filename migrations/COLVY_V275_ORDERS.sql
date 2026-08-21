-- Orders & Fulfillment — Phase 1 schema.
--
-- A channel-agnostic operational order model (Shopify / WooCommerce / eBay /
-- manual / POS …), decoupled from any one storefront or carrier. Populated for
-- now by syncing from the existing woocommerce_orders, but nothing here is
-- WooCommerce-specific. Company-scoped like the rest of Colvy; permissive RLS
-- matches the existing operational tables (conversation_tasks, order_chat_events,
-- call_devices) — access is scoped by company_id in every query.

-- ── orders ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  contact_id UUID,                       -- Colvy contact (customer)
  conversation_id UUID,                  -- linked inbox thread, if any
  source_order_id UUID,                  -- woocommerce_orders.id we synced from
  external_order_id TEXT,                -- the storefront's order id
  order_number TEXT,                     -- human order # (e.g. RA-10284)
  sales_channel TEXT DEFAULT 'manual',   -- shopify | woocommerce | ebay | amazon | pos | phone | website | manual | colvy
  store_location_id UUID,                -- company_locations.id
  status TEXT DEFAULT 'awaiting_shipment', -- awaiting_shipment | packed | on_hold | click_and_collect | shipped | cancelled | manual | alert
  payment_status TEXT,                   -- paid | pending | refunded | failed
  fulfilment_status TEXT,                -- unfulfilled | partial | fulfilled
  assignee_id UUID,                      -- team member (auth user id)
  assignee_name TEXT,
  shipping_method TEXT,
  primary_sku TEXT,                      -- first line item's SKU, for the table column
  carrier TEXT,                          -- australia_post | startrack | sendle | aramex | dhl | custom …
  tracking_number TEXT,
  tracking_url TEXT,
  subtotal NUMERIC,
  shipping_total NUMERIC,
  tax_total NUMERIC,
  discount_total NUMERIC,
  total NUMERIC,
  currency TEXT DEFAULT 'AUD',
  item_count INT DEFAULT 0,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  shipping_address JSONB,
  tags TEXT[] DEFAULT '{}',
  flagged BOOLEAN DEFAULT false,         -- an "Order Alert"
  order_date TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_channel_ext ON orders (company_id, sales_channel, external_order_id) WHERE external_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_company_status ON orders (company_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_company_date ON orders (company_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_contact ON orders (contact_id);
CREATE INDEX IF NOT EXISTS idx_orders_assignee ON orders (assignee_id);
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders (source_order_id);

-- ── order_items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  product_id TEXT,
  product_name TEXT,
  sku TEXT,
  quantity INT DEFAULT 1,
  unit_price NUMERIC,
  total_price NUMERIC,
  image_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);

-- ── order_notes (private internal notes) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  author_id UUID,
  author_name TEXT,
  body TEXT NOT NULL,
  mentions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_notes_order ON order_notes (order_id);

-- ── order_events (activity timeline) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  type TEXT NOT NULL,                    -- created | payment_received | assigned | note_added | label_created | packed | tracking_sent | contacted | shipped | delivered | returned | refunded | status_changed
  detail TEXT,
  actor_id UUID,
  actor_name TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events (order_id, created_at DESC);

-- ── shipments (modular carrier layer) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  carrier TEXT,
  service TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  label_url TEXT,
  status TEXT DEFAULT 'created',         -- created | label_purchased | in_transit | delivered | cancelled
  cost NUMERIC,
  currency TEXT DEFAULT 'AUD',
  weight_grams INT,
  provider_ref TEXT,                     -- the carrier's shipment id
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments (order_id);

-- ── tracking_events ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  order_id UUID,
  company_id UUID NOT NULL,
  status TEXT,
  description TEXT,
  location TEXT,
  occurred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tracking_events_shipment ON tracking_events (shipment_id);

-- ── RLS (permissive, company-scoped in queries — matches existing tables) ────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['orders','order_items','order_notes','order_events','shipments','tracking_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Anyone can manage %1$s" ON %1$s', t);
    EXECUTE format('CREATE POLICY "Anyone can manage %1$s" ON %1$s FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
