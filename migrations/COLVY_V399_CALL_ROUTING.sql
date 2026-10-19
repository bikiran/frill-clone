-- ============================================================
-- COLVY V399 — CALL ROUTING: RING ORDER, FORWARDING, PHONE MENU
--
-- Each Colvy (Twilio) number can now route its incoming calls
-- (lib/call-routing.ts, Settings → Calls & SMS → Call routing):
--   • ring everyone at once (the default, exactly as before),
--   • ring team members in order, then optionally everyone, then optionally
--     an outside number,
--   • forward to an outside Australian mobile or landline (always, or only
--     while closed), with optional call screening ("press 1 to take it"),
--   • a press-1 phone menu, with an optional after-hours menu.
--
-- Creates:
--   call_routing        one row per business number that has routing saved.
--     company_id          the business
--     phone_number        the number, E.164 (unique per business). Keyed by the
--                         number rather than phone_numbers.id so a legacy number
--                         with no phone_numbers row can be routed too; a number
--                         that moves to another business never takes its
--                         routing with it (the lookup is company + number).
--     phone_number_id     phone_numbers.id when there is one (informational)
--     config              the routing as JSON, validated by the API
--                         (validateRouting) before it is saved, and read
--                         leniently (cleanRouting) when a call comes in
--     updated_by, created_at, updated_at
--
-- Adds to calls (all nullable; what routing did on each call, for the inbox
-- call card and call history; the same is also kept in calls.routing_state,
-- V285, so nothing depends on these columns):
--     ivr_choice          "Pressed 2 · Support" / "No key pressed · Ring everyone"
--     routing_path        "Phone menu → Pressed 2 · Support → Rang 1 person → Forwarded to 0412 345 678"
--     forwarded_to        the outside number a call was forwarded to and answered on
--     forwarded_seconds   that forwarded leg's length (outbound minutes on
--                         Colvy's Twilio account)
--     voicemail_box       the menu option a voicemail was left under ("Sales")
--
-- Access (V375 / V382 / V398 style):
--   • SELECT — staff of the company (is_company_member, which leaves out board
--     visitors and removed members) and the platform admin.
--   • INSERT / UPDATE / DELETE — the server only (service role). Owners and
--     admins save routing through /api/call-routing, which checks
--     requireCompanyAdmin and validates the config. No write policy and no
--     write privilege for anon or authenticated.
--   If is_company_member() is missing, or is still V209's first version, the
--   table is created SERVER ONLY (no read policy) and a notice says so; the
--   app reads it with the service role either way. Run V337 and then this
--   file again to add the read policy.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- Any time, before or after the code from branch claude/phone-routing is
-- deployed. Until it runs, every call rings everyone at once exactly as
-- before (the code treats the missing table as "no routing saved"), the
-- settings card says routing needs this update, and saving is refused.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. The last query lists one policy (call_routing_member_read).
--   2. Settings → Calls & SMS → Call routing: pick "Ring in order", add two
--      people, Save. Reload: it's still there. Ring the number: the first
--      person rings alone, then the second.
--   3. Signed in as staff (anon key + their token):
--        select * from call_routing;                                → their business's rows only
--        insert into call_routing (company_id, phone_number) ...;    → permission denied
--   4. select ivr_choice, routing_path, forwarded_to, forwarded_seconds, voicemail_box from calls limit 1;  → runs
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 0: what this builds on ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.companies') IS NULL THEN
    RAISE EXCEPTION 'public.companies does not exist';
  END IF;
END $$;

-- The platform admin check (same body as V351 / V364 / V375 / V395 / V398).
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT lower(COALESCE(auth.jwt() ->> 'email', '')) = 'bishalstha76@gmail.com'
$$;
REVOKE ALL ON FUNCTION is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated, service_role;

-- ── STEP 1: the routing table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.call_routing (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_number     TEXT NOT NULL,
  phone_number_id  UUID,
  config           JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Columns any hand-made table lacks.
ALTER TABLE public.call_routing
  ADD COLUMN IF NOT EXISTS phone_number_id  UUID,
  ADD COLUMN IF NOT EXISTS config           JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_by       UUID,
  ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS call_routing_company_number_uniq ON public.call_routing (company_id, phone_number);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'call_routing_number_e164') THEN
    ALTER TABLE public.call_routing ADD CONSTRAINT call_routing_number_e164
      CHECK (phone_number ~ '^\+[0-9]{8,15}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'call_routing_config_object') THEN
    ALTER TABLE public.call_routing ADD CONSTRAINT call_routing_config_object
      CHECK (jsonb_typeof(config) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'call_routing_config_size') THEN
    ALTER TABLE public.call_routing ADD CONSTRAINT call_routing_config_size
      CHECK (octet_length(config::text) <= 65536);
  END IF;
END $$;

-- ── STEP 2: what routing did on each call ───────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.calls') IS NULL THEN
    RAISE NOTICE 'public.calls does not exist: skipping the call columns. Run this file again once it does.';
  ELSE
    ALTER TABLE public.calls
      ADD COLUMN IF NOT EXISTS ivr_choice         TEXT,
      ADD COLUMN IF NOT EXISTS routing_path       TEXT,
      ADD COLUMN IF NOT EXISTS forwarded_to       TEXT,
      ADD COLUMN IF NOT EXISTS forwarded_seconds  INTEGER,
      ADD COLUMN IF NOT EXISTS voicemail_box      TEXT;
  END IF;
END $$;

-- ── STEP 3: access ──────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  member_ok BOOLEAN := to_regprocedure('public.is_company_member(uuid)') IS NOT NULL
    AND pg_get_functiondef(to_regprocedure('public.is_company_member(uuid)')) ILIKE '%''viewer''%';
BEGIN
  ALTER TABLE public.call_routing ENABLE ROW LEVEL SECURITY;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'call_routing' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.call_routing', r.policyname);
  END LOOP;
  REVOKE ALL ON public.call_routing FROM anon, authenticated;
  GRANT ALL ON public.call_routing TO service_role;
  IF member_ok THEN
    CREATE POLICY call_routing_member_read ON public.call_routing
      FOR SELECT TO authenticated USING (is_company_member(company_id) OR is_platform_admin());
    GRANT SELECT ON public.call_routing TO authenticated;
  ELSE
    RAISE NOTICE 'is_company_member() is missing or still counts board visitors: call_routing is server only. Run COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql, then this file again.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 4: check ───────────────────────────────────────────────────────────
SELECT policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'call_routing';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Every number goes back to ringing everyone at once (the code keeps working
-- without the table and the columns). The call columns only hold history of
-- what routing did; drop them too if you want them gone:
--
--   DROP TABLE IF EXISTS public.call_routing;
--   ALTER TABLE public.calls
--     DROP COLUMN IF EXISTS ivr_choice,
--     DROP COLUMN IF EXISTS routing_path,
--     DROP COLUMN IF EXISTS forwarded_to,
--     DROP COLUMN IF EXISTS forwarded_seconds,
--     DROP COLUMN IF EXISTS voicemail_box;
--   NOTIFY pgrst, 'reload schema';
