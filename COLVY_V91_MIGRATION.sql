-- Colvy v91 Migration
-- Features: Real-time Webhooks, Form Auto-Fill, Customer Segmentation, Scheduled Sync, Customer Profile

-- Ensure woocommerce_integrations has sync_frequency_minutes (should exist from v90)
ALTER TABLE woocommerce_integrations 
ADD COLUMN IF NOT EXISTS sync_frequency_minutes INTEGER DEFAULT 60;

-- Add webhook management table for tracking registered webhooks
CREATE TABLE IF NOT EXISTS woocommerce_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  woo_webhook_id INTEGER NOT NULL,
  topic TEXT NOT NULL, -- customer.created, customer.updated, order.created, order.updated
  delivery_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(company_id, woo_webhook_id)
);

CREATE INDEX IF NOT EXISTS woocommerce_webhooks_company_idx ON woocommerce_webhooks(company_id);

-- Customer notes/tags for segmentation
CREATE TABLE IF NOT EXISTS customer_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES woocommerce_customers(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(customer_id, tag)
);

CREATE INDEX IF NOT EXISTS customer_tags_company_idx ON customer_tags(company_id);
CREATE INDEX IF NOT EXISTS customer_tags_customer_idx ON customer_tags(customer_id);

-- Customer notes for internal use
CREATE TABLE IF NOT EXISTS customer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES woocommerce_customers(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_notes_company_idx ON customer_notes(company_id);
CREATE INDEX IF NOT EXISTS customer_notes_customer_idx ON customer_notes(customer_id);

-- Customer interactions log (viewed profile, contacted, etc)
CREATE TABLE IF NOT EXISTS customer_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES woocommerce_customers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  interaction_type TEXT NOT NULL, -- 'viewed_profile', 'sent_email', 'contacted', etc
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_interactions_company_idx ON customer_interactions(company_id);
CREATE INDEX IF NOT EXISTS customer_interactions_customer_idx ON customer_interactions(customer_id);

-- Enable RLS on new tables
ALTER TABLE woocommerce_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_interactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies (permissive for now, restrict as needed)
CREATE POLICY "Allow all for webhooks" ON woocommerce_webhooks FOR ALL USING (true);
CREATE POLICY "Allow all for tags" ON customer_tags FOR ALL USING (true);
CREATE POLICY "Allow all for notes" ON customer_notes FOR ALL USING (true);
CREATE POLICY "Allow all for interactions" ON customer_interactions FOR ALL USING (true);

-- Performance indexes
CREATE INDEX IF NOT EXISTS woocommerce_customers_email_idx ON woocommerce_customers(email);
CREATE INDEX IF NOT EXISTS woocommerce_customers_total_spend_idx ON woocommerce_customers(total_spend DESC);
CREATE INDEX IF NOT EXISTS woocommerce_customers_last_order_idx ON woocommerce_customers(last_order_date DESC);
CREATE INDEX IF NOT EXISTS woocommerce_orders_order_date_idx ON woocommerce_orders(order_date DESC);

-- Add comments for documentation
COMMENT ON TABLE woocommerce_webhooks IS 'Tracks registered WooCommerce webhooks for real-time sync';
COMMENT ON TABLE customer_tags IS 'User-defined tags for customer segmentation and organization';
COMMENT ON TABLE customer_notes IS 'Internal notes on customers for team collaboration';
COMMENT ON TABLE customer_interactions IS 'Log of team interactions with customers';
