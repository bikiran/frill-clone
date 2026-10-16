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
--     author of an idea or comment (or the idea's new assignee). Always with
--     related_idea_id; never company_id, conversation_id, title, body or
--     link. Any signed-in user.
--   • Mobile (colvy-mobile lib/mentions.ts notifyTask): 'task_assigned' rows
--     with company_id, from staff, for the task's assignee and @mentioned
--     teammates. Shipped app builds can't be changed overnight, so a browser
--     must still be able to write staff-only types to staff.
--   • The web inbox used to insert 'task_assigned' itself; it now goes through
--     /api/notify/members (same branch as V383).
--
-- ── THE RULE (for anon and authenticated; roles that bypass RLS are exempt) ─
-- (a) Board types — vote, comment, reply, status_change, assigned (any case) —
--     for any recipient, but only in exactly the shape createNotification
--     writes: related_idea_id set (every caller passes the idea), and
--     company_id, conversation_id, title, body and link all NULL. So a visitor
--     can't dress a 'vote' up as "New SMS from +61…" with a title, or point it
--     at a conversation or a workspace. A row that breaks this is REFUSED
--     (the insert errors).
-- (b) Staff-only types (V383's list, below): company_id set, the caller staff
--     of that company (or the platform admin, is_platform_admin(), as in
--     requireCompanyAccess) AND the recipient staff of it. A staff-only row
--     that fails this is SKIPPED, not refused: a BEFORE INSERT trigger drops
--     it and lets the rest of the batch land. The mobile app's notifyTask
--     sends one multi-row insert built from the whole team list, which can
--     include board visitors (they're on team_members as 'viewer' and can be
--     @mentioned by name), and one such row must not cost the teammates
--     their notification. The insert rule also checks (b), in case the
--     trigger is ever dropped.
-- Everything else is refused: other types ('announcement' is server-only)
-- and types nobody knows.
-- Staff = the owner, or a team_members row whose role isn't 'viewer' and whose
-- status isn't 'removed' (any case; blank counts as staff) — the same rule as
-- lib/company-access.ts staffUserIds and V337's is_company_member.
-- To make (a) checkable everywhere, this adds the columns the code already
-- writes if an environment lacks them: company_id (V262), conversation_id
-- (V144), related_idea_id (DATABASE_SETUP.sql), and title / body / link (written by /api/notify/members and the
-- calendar reminders).
--
-- The rule is installed twice: as the permissive INSERT policy, and as a
-- RESTRICTIVE one. Postgres ANDs restrictive policies with the permissive
-- ones, so a hand-made "anyone can insert" policy (from the dashboard, or one
-- this file doesn't know about) can't reopen the hole. The NOTICE lists any
-- such policy; it is left alone because it may also grant reads.
--
-- notification_insert_allowed(company, recipient) answers (b). It is SECURITY
-- DEFINER so it can read team_members whatever their RLS, and it says yes only
-- when the CALLER is staff (or the platform admin), so it tells a visitor
-- nothing. Also adds an index on team_members (company_id, user_id) for it.
--
-- ── BEFORE RUNNING ──────────────────────────────────────────────────────────
-- Deploy this branch's web code first (the inbox's task notifications move to
-- /api/notify/members). Run after V383 (any time after is fine). Needs
-- auth.uid() (Supabase). Uses is_platform_admin() (V351/V364) when it exists.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. SELECT policyname, permissive, cmd, with_check FROM pg_policies
--       WHERE tablename = 'notifications' ORDER BY 1;
--      shows notifications_insert (PERMISSIVE) and notifications_insert_guard
--      (RESTRICTIVE), and no "Authenticated users can create notifications";
--      SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.notifications'::regclass
--      AND NOT tgisinternal; shows notifications_skip_disallowed.
--   2. On a board: vote on someone's idea and comment on it — the author still
--      gets the bell notification.
--   3. In the mobile app, assign a task to a teammate — they still get it,
--      even when the same task @mentions a board visitor (who gets nothing).
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
  platform_admin text;
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

  -- The columns the code writes, so rule (a) can name them everywhere.
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS company_id UUID;       -- as V262
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS conversation_id UUID;  -- as V144
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_idea_id UUID; -- DATABASE_SETUP.sql has it
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title TEXT;
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS body TEXT;
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link TEXT;

  CREATE INDEX IF NOT EXISTS idx_team_members_company_user ON public.team_members (company_id, user_id);

  -- The platform admin may send as if staff (requireCompanyAccess does too).
  IF to_regprocedure('public.is_platform_admin()') IS NOT NULL THEN
    platform_admin := 'OR public.is_platform_admin()';
  ELSE
    platform_admin := '';
  END IF;

  -- (b): the caller (or the platform admin) and the recipient are both staff.
  EXECUTE format($f$
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
                           AND lower(COALESCE(tm.role, '')) <> 'viewer')
             %s)
        AND (EXISTS (SELECT 1 FROM companies c WHERE c.id = target_company AND c.owner_id = recipient)
             OR EXISTS (SELECT 1 FROM team_members tm
                         WHERE tm.company_id = target_company AND tm.user_id = recipient
                           AND lower(COALESCE(tm.status, 'active')) <> 'removed'
                           AND lower(COALESCE(tm.role, '')) <> 'viewer'));
    $body$
  $f$, platform_admin);
  REVOKE ALL ON FUNCTION public.notification_insert_allowed(UUID, UUID) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.notification_insert_allowed(UUID, UUID) TO anon, authenticated, service_role;

  -- (b), softly: a browser's staff-only row that fails it is skipped, so the
  -- rest of a multi-row insert still lands. Roles that bypass RLS (the server)
  -- are not touched.
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.notifications_skip_disallowed()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public
    AS $body$
    BEGIN
      IF lower(btrim(NEW."type")) IN (%s)
         AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolbypassrls OR rolsuper))
         AND NOT COALESCE(public.notification_insert_allowed(NEW.company_id, NEW.user_id), false) THEN
        RETURN NULL;
      END IF;
      RETURN NEW;
    END
    $body$
  $f$, staff_only);
  DROP TRIGGER IF EXISTS notifications_skip_disallowed ON public.notifications;
  CREATE TRIGGER notifications_skip_disallowed BEFORE INSERT ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.notifications_skip_disallowed();

  rule := format(
    '(auth.uid() IS NOT NULL AND ('
    || '(lower(btrim("type")) IN (%s) AND related_idea_id IS NOT NULL AND company_id IS NULL'
    || ' AND conversation_id IS NULL AND title IS NULL AND body IS NULL AND link IS NULL)'
    || ' OR (lower(btrim("type")) IN (%s) AND public.notification_insert_allowed(company_id, user_id))))',
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
  RAISE NOTICE 'V384: browser inserts into notifications limited to plain board notifications, and staff-only types between staff (others skipped)';
END $$;

-- ── ROLLBACK (restores the old open rule; the added columns and index stay) ─
--   DROP TRIGGER IF EXISTS notifications_skip_disallowed ON public.notifications;
--   DROP FUNCTION IF EXISTS public.notifications_skip_disallowed();
--   DROP POLICY IF EXISTS notifications_insert_guard ON public.notifications;
--   DROP POLICY IF EXISTS notifications_insert ON public.notifications;
--   CREATE POLICY "Authenticated users can create notifications" ON public.notifications
--     FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
--   DROP FUNCTION IF EXISTS public.notification_insert_allowed(UUID, UUID);
