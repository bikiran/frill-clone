-- ============================================================
-- COLVY V383 — BOARD VISITORS' BELLS STOP SHOWING STAFF NOTIFICATIONS
--
-- Before #769, lib/notify.ts companyRecipients sent a workspace's bell
-- notifications to EVERY team_members row. Everyone who signs in on a public
-- board gets a role 'viewer' row (app/auth/callback), so board visitors were
-- sent the staff's notifications: SMS / email / Messenger / Instagram / chat
-- previews, orders, abandoned carts, bookings, tickets, call-back summaries,
-- calendar reminders, integration warnings. #769 fixed the code (notifyCompany
-- now goes through lib/company-access.ts staffUserIds), but the old rows are
-- still in `notifications`, and the public board's bell (app/AppChrome.tsx)
-- shows a signed-in user every row with their user_id.
--
-- This deletes a notification only when BOTH are true:
--   (a) its type is staff-only (the list below), and
--   (b) its user is not staff of the notification's workspace.
-- Everything else stays: staff keep all their notifications, and visitors keep
-- the board notifications that were always meant for them.
--
-- ── NOTIFICATION TYPES (every writer of `notifications` in the repo) ────────
-- Staff-only — deleted from non-staff:
--   chat              /api/widget/message (website chat), via notifyCompany
--   visitor           the old widget's "new visitor" post to /api/notify
--   activity          /api/notify's default type
--   sms               lib/inbound-sms.ts, /api/telnyx/webhook
--   email             /api/webhooks/email (new inbound email)
--   facebook          /api/meta/webhook (Messenger, type = platform),
--   instagram           /api/cron/refresh-meta-tokens (type = meta_channels.platform)
--   order             orders/create, woocommerce + prexty webhooks, lib/order-automation.ts
--   cart              lib/abandoned-carts.ts
--   booking           lib/booking.ts, lib/booking-replies.ts
--   ticket            /api/tickets, /api/cron/ticket-sla, /api/webhooks/email
--   call              lib/phone-agent.ts (call-back summary), lib/call-alerts.ts
--   calendar          /api/calendar/reminders (notifyCompany and per-assignee rows)
--   realestate        /api/webhooks/realestate
--   integration       /api/cron/shopify-tokens, /api/webhooks/shopify
--   agent_escalation  lib/agent/actions.ts
--   mention           /api/mentions/notify (inbox @mentions)
--   task_assigned     /api/notify/members (tasks), inbox task create
--   task_mention      components/TaskEditor.tsx via /api/notify/members
--   task_comment      app/admin/tasks via /api/notify/members
--   media_note        app/admin/gallery via /api/notify/members
-- Visitor-legitimate — never touched by this migration:
--   vote, comment, reply, status_change, assigned
--                     lib/notifications.ts createNotification, from
--                     components/IdeaDetailModal.tsx and app/page.tsx (the
--                     board: votes on, comments on, replies to and status
--                     changes of the visitor's own ideas and comments)
--   announcement      /api/announcements/notify (subscribers, visitors included)
-- Any type not in the staff-only list is kept, so an unknown or future type
-- is never deleted by mistake. Types are compared in lower case.
--
-- ── WHO IS STAFF ────────────────────────────────────────────────────────────
-- The same rule as lib/company-access.ts staffUserIds / isStaffRow and V337's
-- is_company_member:
--   • the workspace's owner (companies.owner_id) — no team row needed, or
--   • a team_members row there whose role is not 'viewer' and whose status is
--     not 'removed' (either in any case; a blank role or status counts as
--     staff, as in the code).
--
-- ── WHICH WORKSPACE A NOTIFICATION BELONGS TO ───────────────────────────────
--   1. notifications.company_id (V262; every staff-only writer sets it today).
--   2. Otherwise the company of notifications.conversation_id (V144), for
--      older rows written before notifyCompany stored company_id.
-- The workspace counts as known only when that id is an existing company.
-- A staff-only row whose workspace can't be known (no company_id, no
-- conversation, or a deleted company) is KEPT: we can't tell whose staff the
-- user should be. The NOTICE says how many such rows remain; step 1 below
-- lists them. There is no `link`/metadata fallback: the link column holds an
-- in-app path (/admin/...) with no workspace in it.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- After the code from #769 and from this change is deployed (notifyCompany,
-- /api/notify/members, /api/mentions/notify and the calendar reminders send to
-- staff only; the inbox's task notifications now go through
-- /api/notify/members). Running it earlier is harmless but a later leak would
-- need another run. Any order relative to other migrations is fine; it does
-- nothing if `notifications` (or companies / team_members) is missing, and
-- works with or without the company_id / conversation_id columns.
--
-- ── BEFORE RUNNING (optional) ───────────────────────────────────────────────
-- 1. What is about to go (assumes both company_id and conversation_id exist):
--   WITH x AS (
--     SELECT n.id, n.user_id, lower(btrim(n.type)) AS type, n.created_at,
--            COALESCE(n.company_id, (SELECT c.company_id FROM conversations c
--                                     WHERE c.id = n.conversation_id)) AS co
--       FROM notifications n
--      WHERE lower(btrim(n.type)) IN ('chat','visitor','activity','sms','email',
--        'facebook','instagram','order','cart','booking','ticket','call',
--        'calendar','realestate','integration','agent_escalation','mention',
--        'task_assigned','task_mention','task_comment','media_note'))
--   SELECT x.type, count(*) FILTER (WHERE co.id IS NULL)        AS unknown_kept,
--                  count(*) FILTER (WHERE co.id IS NOT NULL
--                    AND co.owner_id IS DISTINCT FROM x.user_id
--                    AND NOT EXISTS (SELECT 1 FROM team_members tm
--                         WHERE tm.company_id = x.co AND tm.user_id = x.user_id
--                           AND lower(COALESCE(tm.status, 'active')) <> 'removed'
--                           AND lower(COALESCE(tm.role, '')) <> 'viewer')) AS to_delete
--     FROM x LEFT JOIN companies co ON co.id = x.co
--    GROUP BY x.type ORDER BY x.type;
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. The query above shows to_delete = 0 for every type (unknown_kept is
--      what the NOTICE reported as kept).
--   2. Running this file again reports "would delete 0".
--   3. A board visitor's bell shows only idea / comment / announcement
--      notifications; an owner, admin and agent still see their full bell.
--
-- Run in the Supabase SQL editor. Safe to re-run (a second run deletes
-- nothing). Everything happens in one DO block, so it is all-or-nothing.
-- No rollback: deleted rows were never meant for those users.
-- ============================================================

DO $$
DECLARE
  -- Staff-only types (see the header for who writes each one).
  staff_only CONSTANT text[] := ARRAY[
    'chat', 'visitor', 'activity',                 -- website chat / widget
    'sms', 'email', 'facebook', 'instagram',       -- inbound customer messages
    'order', 'cart',                               -- commerce
    'booking', 'ticket', 'call', 'calendar',       -- bookings, support, calls, reminders
    'realestate', 'integration', 'agent_escalation',
    'mention', 'task_assigned', 'task_mention', 'task_comment', 'media_note'  -- team work
  ];
  has_company_col boolean;
  has_conv_lookup boolean;
  co_expr   text;
  base_sql  text;
  doomed    text;
  n_total   bigint;
  n_delete  bigint;
  n_unknown bigint;
  n_done    bigint;
  r record;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE NOTICE 'V383: no notifications table, nothing to do';
    RETURN;
  END IF;
  IF to_regclass('public.companies') IS NULL OR to_regclass('public.team_members') IS NULL THEN
    RAISE NOTICE 'V383: companies or team_members is missing, so staff can''t be known; nothing deleted';
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'notifications'
                    AND column_name = 'company_id')
    INTO has_company_col;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'notifications'
                    AND column_name = 'conversation_id')
     AND to_regclass('public.conversations') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'conversations'
                    AND column_name = 'company_id')
    INTO has_conv_lookup;

  -- The notification's workspace: its own company_id, else its conversation's.
  co_expr := format('COALESCE(%s, %s)',
    CASE WHEN has_company_col THEN 'n.company_id' ELSE 'NULL::uuid' END,
    CASE WHEN has_conv_lookup
         THEN '(SELECT c.company_id FROM public.conversations c WHERE c.id = n.conversation_id)'
         ELSE 'NULL::uuid' END);

  -- Staff-only rows, each with its workspace (NULL when it can't be known).
  base_sql := format(
    'SELECT n.id, n.user_id, lower(btrim(n.type)) AS type, co.id AS co
       FROM public.notifications n
       LEFT JOIN public.companies co ON co.id = %s
      WHERE lower(btrim(n.type)) = ANY ($1)', co_expr);

  -- Of those: a known workspace whose staff doesn't include the user.
  doomed := '
    x.co IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.companies o
                     WHERE o.id = x.co AND o.owner_id = x.user_id)
    AND NOT EXISTS (SELECT 1 FROM public.team_members tm
                     WHERE tm.company_id = x.co
                       AND tm.user_id = x.user_id
                       AND lower(COALESCE(tm.status, ''active'')) <> ''removed''
                       AND lower(COALESCE(tm.role, '''')) <> ''viewer'')';

  -- ── Count first ──────────────────────────────────────────────────────────
  EXECUTE format('SELECT count(*), count(*) FILTER (WHERE %s), count(*) FILTER (WHERE x.co IS NULL)
                    FROM (%s) x', doomed, base_sql)
     INTO n_total, n_delete, n_unknown
    USING staff_only;
  RAISE NOTICE 'V383: % staff-only notification(s); would delete % held by non-staff; % have no knowable workspace and are kept',
    n_total, n_delete, n_unknown;
  IF NOT has_company_col THEN
    RAISE NOTICE 'V383: notifications has no company_id column (V262 not run); workspace taken from conversation_id only';
  END IF;
  IF NOT has_conv_lookup THEN
    RAISE NOTICE 'V383: no conversation_id → conversations.company_id lookup available; workspace taken from company_id only';
  END IF;
  FOR r IN EXECUTE format('SELECT x.type, count(*) AS n FROM (%s) x WHERE %s GROUP BY 1 ORDER BY 1',
                          base_sql, doomed) USING staff_only LOOP
    RAISE NOTICE 'V383:   would delete % × %', r.n, r.type;
  END LOOP;

  IF n_delete = 0 THEN
    RAISE NOTICE 'V383: nothing to delete';
    RETURN;
  END IF;

  -- ── Then delete ──────────────────────────────────────────────────────────
  EXECUTE format('DELETE FROM public.notifications d USING (%s) x WHERE d.id = x.id AND %s',
                 base_sql, doomed)
    USING staff_only;
  GET DIAGNOSTICS n_done = ROW_COUNT;
  RAISE NOTICE 'V383: deleted % notification(s); % staff-only notification(s) with no knowable workspace remain',
    n_done, n_unknown;
END $$;
