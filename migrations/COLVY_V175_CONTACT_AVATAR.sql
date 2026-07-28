-- ============================================================
-- COLVY V175 — CONTACT PROFILE PHOTO + LAST ACTIVITY
--
-- Pull the customer's profile photo from Messenger / Instagram (Meta gives us
-- profile_pic), and track last activity for the "Last activity 5m ago" line.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_customer_activity_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
