-- ============================================================
-- COLVY V171 — EMAIL AUTO-SYNC + JUNK FILTERING
--
-- Email only ever arrived when someone pressed "Sync now", so
-- customer mail sat unread in Gmail. And every newsletter, vendor
-- receipt and auto-reply landed in the inbox, burying the real
-- enquiries.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- How often this mailbox should auto-sync. 0 = off. The Vercel cron
-- (/api/cron/email-sync, every 5 min) honours this per mailbox.
ALTER TABLE email_channels ADD COLUMN IF NOT EXISTS sync_interval_minutes INT DEFAULT 5;

-- Which classes of bulk mail to bin. Defaults ON (all true) — the
-- code treats a missing key as enabled.
ALTER TABLE email_channels ADD COLUMN IF NOT EXISTS filter_settings JSONB DEFAULT '{
  "ignore_noreply": true,
  "ignore_newsletters": true,
  "ignore_marketing": true,
  "ignore_autoreply": true
}'::jsonb;

NOTIFY pgrst, 'reload schema';
