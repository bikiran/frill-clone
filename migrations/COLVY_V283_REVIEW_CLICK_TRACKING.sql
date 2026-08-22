-- ============================================================
-- COLVY V283 — SMARTER REVIEW REQUESTS (click tracking + suppression)
-- Tracks whether a customer clicked a review link, so we stop asking
-- customers who have already engaged with a review request, and never
-- pester repeat buyers after every single order. Safe to re-run.
-- ============================================================

-- When the customer opened the tracked review link for THIS request.
ALTER TABLE review_requests ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;

-- The last time this contact clicked ANY review link. Once set, the dispatcher
-- suppresses future automatic review requests for that contact (so a returning
-- customer who already left/opened a review isn't asked again after every order).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS review_clicked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_review_requests_clicked ON review_requests (contact_id) WHERE clicked_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
