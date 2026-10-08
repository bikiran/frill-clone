-- ============================================================
-- COLVY V336 — LOCK SCHEDULED MESSAGES TO THEIR OWN WORKSPACE
--
-- scheduled_messages was created (V105) with `FOR ALL USING (true)` and no TO
-- clause, i.e. TO PUBLIC, anon included. The anon key ships in the web bundle
-- and the Android app, so anyone could read every workspace's queued replies
-- (customer names, numbers, message text), edit them before they go out, or
-- queue a message to any conversation. V209/V210/V299/V333 locked other
-- tables; this one was never included.
--
-- Who still reaches this table after this:
--   • the admin inbox, /admin/scheduled and the mobile app, signed in, as a
--     member of the workspace — allowed by is_company_member (V209)
--   • /api/inbox/scheduled, /api/cron/send-scheduled, lib/scheduled-send and
--     the customer-match merge, which use the service role and bypass RLS.
--     /api/inbox/scheduled already checks the caller (requireCompanyAccess).
-- No public page reads this table with the anon key.
--
-- Rows with no company_id (none are written that way today) become visible
-- only to the service role, which is what the cron uses — they still send.
--
-- Like V299/V333, this drops EVERY policy on the table except the
-- company_members_* one, whatever it's called, rather than guessing names.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. Step 3: one company_members_scheduled_messages policy, TO authenticated.
--   2. Signed OUT, `select count(*) from scheduled_messages;` returns 0 rows visible.
--   3. Web inbox: schedule a reply, then edit / send now / delete it.
--   4. Mobile: long-press Send → Schedule message…, then the strip's
--      Edit / Send now / Delete.
--   5. /admin/scheduled lists and cancels.
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 1: what is about to be dropped ─────────────────────────────────────
SELECT tablename, policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename = 'scheduled_messages'
   AND policyname <> 'company_members_scheduled_messages'
 ORDER BY policyname;

-- ── STEP 2: drop them, then add the member policy ──────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'scheduled_messages'
       AND policyname <> 'company_members_scheduled_messages'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.scheduled_messages', r.policyname);
    RAISE NOTICE 'dropped % on scheduled_messages', r.policyname;
  END LOOP;
END $$;

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_members_scheduled_messages ON public.scheduled_messages;
CREATE POLICY company_members_scheduled_messages ON public.scheduled_messages
  FOR ALL
  TO authenticated
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

NOTIFY pgrst, 'reload schema';

-- ── STEP 3: confirm ─────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename = 'scheduled_messages'
 ORDER BY policyname;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Only if scheduling breaks and can't wait. This reopens the leak.
--
--   CREATE POLICY "Anyone can manage scheduled_messages" ON public.scheduled_messages FOR ALL USING (true);
--   NOTIFY pgrst, 'reload schema';
