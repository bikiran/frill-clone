-- COLVY V262 — NOTIFICATIONS COMPANY SCOPE
--
-- Notifications were user-scoped only, with no company association. A user who
-- belongs to several companies (e.g. two Colvy subdomains open at once) got the
-- notification chime in EVERY tab for EVERY company's events, because nothing
-- tied a notification to the company it belongs to.
--
-- Add company_id so the client can chime/notify only for the company the tab is
-- actually viewing. Idempotent: several inserters already write this column, so
-- it may already exist in some environments.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS company_id UUID;

CREATE INDEX IF NOT EXISTS idx_notifications_company_user
  ON notifications (company_id, user_id);
