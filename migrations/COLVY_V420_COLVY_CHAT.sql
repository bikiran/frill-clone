-- ============================================================
-- COLVY V420 — THE COLVY CHAT: EVERYONE'S PRIVATE LINE TO COLVY
--
-- Each person gets a "Colvy" chat pinned at the top of their inbox, like the
-- official accounts in WhatsApp and Telegram: a welcome, the product updates
-- the Colvy team posts, and a reply box. Only that person sees it (their
-- colleagues each have their own). What they write lands in Colvy's own
-- support workspace inbox as a normal conversation (channel 'colvy'), and the
-- team's answers there come back into their chat (lib/colvy-chat.ts).
--
-- Nothing is copied into every chat: the welcome and the updates are put
-- together when a person opens theirs, and a support conversation is only
-- created the first time they write, so Colvy's inbox holds real messages
-- only.
--
-- Creates:
--   colvy_chats      one row per person (auth user)
--     user_id          the person (primary key)
--     email            their sign-in email when the chat started
--     conversation_id  their conversation in Colvy's workspace; null until they
--                      first write
--     contact_id       their contact in Colvy's workspace
--     started_at       when their chat began (the welcome's time; updates from
--                      30 days before this on are shown)
--     last_read_at     what they have seen (drives the unread count)
--   colvy_updates    the posts the Colvy team writes (Platform admin → Colvy
--                    chat updates)
--     title, body      what people read (title 1–120, body up to 4000)
--     link_url, link_label   an optional button ("Open Channels")
--     published_at     null = a draft only the platform admin sees
--     created_by, created_at, updated_at
--
-- Access: SERVER ONLY. RLS on, no policies, no privileges for anon or
-- authenticated. People read and write their own chat through /api/colvy-chat
-- (signed in; it only ever touches the caller's own row and conversation and
-- never returns internal notes). The platform admin writes updates through
-- /api/platform-admin/colvy-updates, which checks the super admin and records
-- each change in super_admin_audit.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- Any time, before or after the code from branch claude/colvy-updates-chat is
-- deployed. Until it runs, the Colvy chat doesn't appear in the inbox and the
-- admin page says to run this file. Colvy's own workspace (slug "colvy", or
-- COLVY_SUPPORT_SLUG) must exist for replies to be delivered.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. The last query lists both tables with rls = true and no policies.
--   2. Open the inbox: "Colvy" is pinned at the top with one unread (the
--      welcome). Write to it: the message appears in Colvy's workspace inbox
--      tagged "Colvy app"; reply there and it shows in the chat.
--   3. With the anon key: select * from colvy_chats;  → permission denied
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 1: one chat per person ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.colvy_chats (
  user_id          UUID PRIMARY KEY,
  email            TEXT,
  conversation_id  UUID,
  contact_id       UUID,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at     TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS colvy_chats_conversation_idx
  ON public.colvy_chats (conversation_id) WHERE conversation_id IS NOT NULL;

-- ── STEP 2: the updates the Colvy team posts ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.colvy_updates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body          TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
  link_url      TEXT,
  link_label    TEXT,
  published_at  TIMESTAMPTZ,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS colvy_updates_published_idx
  ON public.colvy_updates (published_at DESC) WHERE published_at IS NOT NULL;

-- ── STEP 3: access (server only) ────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['colvy_chats', 'colvy_updates'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 4: check ───────────────────────────────────────────────────────────
SELECT c.relname AS table_name, c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN ('colvy_chats', 'colvy_updates')
 ORDER BY 1;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- The Colvy chat disappears from the inbox (the code keeps working without the
-- tables). Conversations people started stay in Colvy's workspace inbox.
-- Dropping colvy_updates loses the posts, so export them first if needed.
--
--   DROP TABLE IF EXISTS public.colvy_updates;
--   DROP TABLE IF EXISTS public.colvy_chats;
--   NOTIFY pgrst, 'reload schema';
