-- ============================================================
-- COLVY V384 — BROWSERS CAN ONLY WRITE THE NOTIFICATIONS THEY NEED
--
-- RUN_ALL_MISSING_MIGRATIONS.sql added
--   "Authenticated users can create notifications"  FOR INSERT
--     WITH CHECK (auth.uid() IS NOT NULL)
-- so anyone signed in (a board visitor included) could write any notification,
-- of any type, for any user, straight from the browser with the public key: a
-- fake "New SMS from …" or "Order #…" in a business's bell, or staff-only rows
-- in a visitor's bell (the leak V383 cleaned up).
--
-- The server (service role) bypasses RLS and is not affected: notifyCompany,
-- /api/notify/members, /api/mentions/notify, /api/calendar/reminders and
-- /api/announcements/notify all write with it. (A route that falls back to the
-- anon key was already refused, because auth.uid() is NULL there.)
--
-- ── WHO STILL WRITES FROM A BROWSER ─────────────────────────────────────────
--   • Web, lib/notifications.ts createNotification (IdeaDetailModal, app/page):
--     board types vote / comment / reply / status_change / assigned, for the
--     author of an idea or comment. No company_id. Any signed-in user.
--   • Mobile (colvy-mobile lib/mentions.ts notifyTask): 'task_assigned' rows
--     with company_id, from staff, for the task's assignee and @mentioned
--     teammates. Shipped app builds can't be changed overnight, so a browser
--     must still be able to write staff-only types to staff.
--   • The web inbox used to insert 'task_assigned' itself; it now goes through
--     /api/notify/members (same branch as V383).
--
-- ── THE RULE (for anon and authenticated; the service role is exempt) ───────
-- A browser insert is allowed only when the caller is signed in and either
--   (a) the type is a board type: vote, comment, reply, status_change,
--       assigned (any case) — for any recipient, as before; or
--   (b) the type is staff-only (V383's list, below), company_id is set, the
--       caller is staff of that company AND the recipient is staff of it.
-- Staff = the owner, or a team_members row whose role isn't 'viewer' and whose
-- status isn't 'removed' (any case; blank counts as staff) — the same rule as
-- lib/company-access.ts staffUserIds and V337's is_company_member.
-- Everything else is refused: other types ('announcement' is server-only),
-- and types nobody knows. A multi-row insert is refused as a whole if any row
-- fails, so the mobile app's notifyTask loses the whole batch if it names a
-- board visitor (it shouldn't: visitors aren't assignable).
--
-- The rule is installed twice: as the permissive INSERT policy, and as a
-- RESTRICTIVE one. Postgres ANDs restrictive policies with the permissive
-- ones, so a hand-made "anyone can insert" policy (from the dashboard, or one
-- this file doesn't know about) can't reopen the hole. The NOTICE lists any
-- such policy; it is left alone because it may also grant reads.
--
-- notification_insert_allowed(company, recipient) answers (b). It is SECURITY
-- DEFINER so it can read team_members whatever their RLS, and it says yes only
-- when the CALLER is staff, so it tells a non-member nothing.
--
-- ── BEFORE RUNNING ──────────────────────────────────────────────────────────
-- Deploy this branch's web code first (the inbox's task notifications move to
-- /api/notify/members). Run after V383 (any time after is fine). Needs
-- auth.uid() (Supabase). Adds notifications.company_id if V262 never ran.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. SELECT policyname, permissive, cmd, with_check FROM pg_policies
--       WHERE tablename = 'notifications' ORDER BY 1;
--      shows notifications_insert (PERMISSIVE) and notifications_insert_guard
--      (RESTRICTIVE), and no "Authenticated users can create notifications".
--   2. On a board: vote on someone's idea and comment on it — the author still
--      gets the bell notification.
--   3. In the mobile app, assign a task to a teammate — they still get it.
--   4. In the web inbox, add a task with an assignee — they still get it.
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

DO $$
DECLARE
  -- Board types any signed-in browser may write (lib/notification-types.ts
  -- BOARD_NOTIFICATION_TYPES).
  board CONSTANT text := $q$'vote', 'comment', 'reply', 'status_change', 'assigned'$q$;
  -- Staff-only types (V383; lib/notification-types.ts STAFF_ONLY_NOTIFICATION_TYPES).
  staff_only CONSTANT text := $q$'chat', 'visitor', 'activity', 'sms', 'email', 'facebook', 'instagram', 'order', 'cart', 'booking', 'ticket', 'call', 'calendar', 'realestate', 'integration', 'agent_escalation', 'mention', 'task_assigned', 'task_mention', 'task_comment', 'media_note'$q$;
  rule text;
  r record;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE NOTICE 'V384: no notifications table, nothing to do';
    RETURN;
  END IF;
  IF to_regclass('public.companies') IS NULL OR to_regclass('public.team_members') IS NULL THEN
    RAISE NOTICE 'V384: companies or team_members is missing; nothing changed';
    RETURN;
  END IF;

  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS company_id UUID;   -- as V262

  -- (b): the caller and the recipient are both staff of the company.
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION public.notification_insert_allowed(target_company UUID, recipient UUID)
    RETURNS BOOLEAN
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
    SET search_path = public
    AS $body$
      SELECT target_company IS NOT NULL AND recipient IS NOT NULL AND auth.uid() IS NOT NULL
        AND (EXISTS (SELECT 1 FROM companies c WHERE c.id = target_company AND c.owner_id = auth.uid())
             OR EXISTS (SELECT 1 FROM team_members tm
                         WHERE tm.company_id = target_company AND tm.user_id = auth.uid()
                           AND lower(COALESCE(tm.status, 'active')) <> 'removed'
                           AND lower(COALESCE(tm.role, '')) <> 'viewer'))
        AND (EXISTS (SELECT 1 FROM companies c WHERE c.id = target_company AND c.owner_id = recipient)
             OR EXISTS (SELECT 1 FROM team_members tm
                         WHERE tm.company_id = target_company AND tm.user_id = recipient
                           AND lower(COALESCE(tm.status, 'active')) <> 'removed'
                           AND lower(COALESCE(tm.role, '')) <> 'viewer'));
    $body$
  $f$;
  REVOKE ALL ON FUNCTION public.notification_insert_allowed(UUID, UUID) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.notification_insert_allowed(UUID, UUID) TO anon, authenticated, service_role;

  rule := format(
    '(auth.uid() IS NOT NULL AND (lower(btrim("type")) IN (%s) OR (lower(btrim("type")) IN (%s) AND public.notification_insert_allowed(company_id, user_id))))',
    board, staff_only);

  ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;
  DROP POLICY IF EXISTS notifications_insert ON public.notifications;
  DROP POLICY IF EXISTS notifications_insert_guard ON public.notifications;
  EXECUTE format('CREATE POLICY notifications_insert ON public.notifications
                    AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK %s', rule);
  EXECUTE format('CREATE POLICY notifications_insert_guard ON public.notifications
                    AS RESTRICTIVE FOR INSERT TO public WITH CHECK %s', rule);

  FOR r IN SELECT policyname, cmd FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'notifications'
              AND permissive = 'PERMISSIVE' AND cmd IN ('INSERT', 'ALL')
              AND policyname <> 'notifications_insert' LOOP
    RAISE NOTICE 'V384: other policy "%" (%) also allows inserts; the restrictive guard now limits it too', r.policyname, r.cmd;
  END LOOP;
  RAISE NOTICE 'V384: browser inserts into notifications limited to board types, and staff-only types between staff';
END $$;

-- ── ROLLBACK (restores the old open rule) ──────────────────────────────────
--   DROP POLICY IF EXISTS notifications_insert_guard ON public.notifications;
--   DROP POLICY IF EXISTS notifications_insert ON public.notifications;
--   CREATE POLICY "Authenticated users can create notifications" ON public.notifications
--     FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
--   DROP FUNCTION IF EXISTS public.notification_insert_allowed(UUID, UUID);
