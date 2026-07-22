-- ============================================================
-- COLVY V205 — TEAM MEMBER PHONE
--
-- SMS reminders for assigned calendar events read team_members.phone, but that
-- column was never created and there was no way to enter a number — so the SMS
-- channel could never fire. This adds the column; the Team page and each
-- person's own profile can now set it.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS phone TEXT;

-- Also used by the contacts filter work: make sure relationship_type exists
-- even if V204 hasn't been run yet.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS relationship_type TEXT DEFAULT 'customer';

NOTIFY pgrst, 'reload schema';
