-- ============================================================
-- COLVY V151 — GOOGLE REVIEWS + AUTO REVIEW REQUESTS
-- Connects a Google Business Profile so reviews land in Colvy and can
-- be replied to, and adds settings for automatically asking customers
-- for a review after their order completes. Safe to re-run.
-- ============================================================

-- Google Business Profile connection (OAuth tokens + selected location).
CREATE TABLE IF NOT EXISTS google_business_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  account_name TEXT,        -- e.g. accounts/123456
  location_name TEXT,       -- e.g. locations/987654
  location_title TEXT,      -- human label, e.g. "Roxy Aquarium Oakleigh"
  review_link TEXT,         -- public "write a review" URL
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gbp_company ON google_business_accounts(company_id);
ALTER TABLE google_business_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage gbp" ON google_business_accounts;
CREATE POLICY "Anyone can manage gbp" ON google_business_accounts FOR ALL USING (true);

-- Google reviews synced into Colvy.
CREATE TABLE IF NOT EXISTS google_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  review_id TEXT NOT NULL,          -- Google's review name/id
  reviewer_name TEXT,
  reviewer_photo TEXT,
  star_rating INT,                  -- 1..5
  comment TEXT,
  reply_comment TEXT,
  replied_at TIMESTAMPTZ,
  review_created_at TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS google_reviews_uniq ON google_reviews (company_id, review_id);
CREATE INDEX IF NOT EXISTS idx_google_reviews_company ON google_reviews(company_id, review_created_at DESC);
ALTER TABLE google_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage google_reviews" ON google_reviews;
CREATE POLICY "Anyone can manage google_reviews" ON google_reviews FOR ALL USING (true);

-- Auto review-request settings, stored per company.
-- { enabled, delay_hours, channels: {chat,sms,email}, message, only_statuses: [...] }
ALTER TABLE companies ADD COLUMN IF NOT EXISTS review_request_settings JSONB DEFAULT '{}'::jsonb;

-- Queue of scheduled review requests (so we can delay them after completion).
CREATE TABLE IF NOT EXISTS review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  conversation_id UUID,
  contact_id UUID,
  order_id TEXT,
  send_after TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',   -- pending | sent | skipped | failed
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS review_requests_order_uniq ON review_requests (company_id, order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_requests_due ON review_requests(status, send_after);
ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage review_requests" ON review_requests;
CREATE POLICY "Anyone can manage review_requests" ON review_requests FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
