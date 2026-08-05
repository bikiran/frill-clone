-- ============================================================
-- COLVY V244 — LINK GOOGLE REVIEWS TO CUSTOMERS
-- A review only carries the reviewer's display name, so we soft-match it to a
-- contact by name (and let an agent link/relink it by hand). Store the linked
-- contact + when we last checked, so the dashboard can show "linked with X" /
-- "Not matched". Additive, safe to re-run.
-- ============================================================

ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS contact_id       uuid;
ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS contact_name     text;
ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS match_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_google_reviews_contact ON google_reviews (contact_id);

NOTIFY pgrst, 'reload schema';
