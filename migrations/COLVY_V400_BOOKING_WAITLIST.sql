-- ============================================================
-- COLVY V400 — BOOKING WAITLIST: FREED SLOTS OFFERED BY TEXT
--
-- When a day is full, customers can join a waitlist on the public booking
-- page (name, mobile, optional email, the service, the days they want and
-- morning / afternoon / any). When a time frees up (a cancellation, a move,
-- an unpaid hold that lapses, the team opening more hours, or the team
-- offering a free time by hand) the people waiting for it get a text with a
-- link that books it through the normal booking page (lib/booking-waitlist.ts,
-- Bookings → Waitlist, settings under Bookings → Settings → Waitlist).
-- The bookings table itself is unchanged: a booking made from an offer has
-- source 'waitlist'; an "in order" hold is a pending booking with source
-- 'waitlist_hold'.
--
-- Creates:
--   booking_waitlist         one row per person waiting for a service
--     company_id, service_id   the business and the service (deleted with it)
--     contact_id, conversation_id   the CRM contact and thread (nullable)
--     customer_name, customer_phone, customer_email, phone_norm (last 9 digits)
--     location_id              the outlet they asked for (NULL = any / default)
--     days                     specific days ('YYYY-MM-DD'[]), or NULL for a range
--     date_from, date_to       the dates wanted (for specific days: first / last)
--     time_window              'any' | 'morning' | 'afternoon'
--     timezone                 the business timezone when they joined
--     status                   'waiting' | 'offered' | 'booked' | 'expired' | 'removed'
--     offers_count, last_offered_at, booking_id, booked_at
--     expires_at               midnight after their last date (business time)
--     consent_text, consent_at, consent_ip   the express consent they gave
--     source                   'page' (the booking page) | 'agent' | 'staff'
--     removed_at, removed_by, created_at, updated_at
--   booking_waitlist_offers  one row per person per freed time (unique), so
--                            nobody is offered the same time twice
--     entry_id, service_id, slot_start, slot_end, location_id
--     token                    the private claim-link token (unique)
--     mode                     'first' (first to claim) | 'order' (one at a time)
--     status                   'sending' | 'sent' | 'claimed' | 'gone' |
--                              'expired' | 'failed' | 'skipped'
--     channel ('sms' | 'email'), sent_at, expires_at, claimed_at,
--     booking_id (the booking made from it), hold_booking_id (the in-order
--     hold), error, created_at
--   booking_waitlist_jobs    the work queue: "a time may have freed up".
--     kind                     'slot_freed' | 'availability' | 'manual' | 'advance'
--     service_id, staff_id, from_at, until_at, payload (JSON)
--     status                   'queued' | 'running' | 'done' | 'failed'
--     run_after, attempts, claimed_at, finished_at, result, created_at
--     A worker claims a job with UPDATE … WHERE status = 'queued' RETURNING,
--     so two runs never process the same job.
--
-- Access (V375 / V398 / V399 style):
--   • booking_waitlist, booking_waitlist_offers — SELECT for staff of the
--     company (is_company_member, which leaves out board visitors and removed
--     members) and the platform admin. INSERT / UPDATE / DELETE — the server
--     only (service role): customers join through /api/book/waitlist (rate
--     limited, consent recorded) and staff remove entries through
--     /api/bookings/waitlist (requireCompanyAccess).
--   • booking_waitlist_jobs — server only (no policy at all): it's plumbing.
--   If is_company_member() is missing, or is still V209's first version, the
--   tables are created SERVER ONLY (no read policy) and a notice says so; the
--   app reads them with the service role either way. Run V337 and then this
--   file again to add the read policies.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- Any time, before or after the code from branch claude/booking-waitlist is
-- deployed. Until it runs nothing changes for customers: the waitlist is off
-- by default, joining answers "the waitlist isn't available yet" (never a
-- 500), cancellations queue nothing, and Bookings → Waitlist says to run this
-- file. Quick: three new empty tables; no existing table is changed.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. The last query lists two policies (booking_waitlist_member_read,
--      booking_waitlist_offers_member_read).
--   2. Bookings → Settings → Waitlist: switch it on, Save. On the booking page
--      pick a full day: "Join the waitlist" shows; join with your mobile.
--      Bookings → Waitlist lists you as Waiting.
--   3. Cancel a booking in a time you asked for: within a few minutes (or
--      straight away, inside sending hours) you get the text; the link books it.
--   4. Signed in as staff (anon key + their token):
--        select * from booking_waitlist;                       → their business's rows only
--        insert into booking_waitlist (...) values (...);       → permission denied
--        select * from booking_waitlist_jobs;                   → permission denied
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 0: what this builds on ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.companies') IS NULL THEN
    RAISE EXCEPTION 'public.companies does not exist';
  END IF;
  IF to_regclass('public.booking_services') IS NULL OR to_regclass('public.bookings') IS NULL THEN
    RAISE EXCEPTION 'booking_services / bookings do not exist — run COLVY_V323_BOOKINGS.sql first';
  END IF;
END $$;

-- The platform admin check (same body as V351 / V364 / V375 / V398 / V399).
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

-- ── STEP 1: who is waiting ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_waitlist (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_id       UUID NOT NULL REFERENCES public.booking_services(id) ON DELETE CASCADE,
  contact_id       UUID,
  conversation_id  UUID,
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT NOT NULL,
  customer_email   TEXT,
  phone_norm       TEXT NOT NULL,
  location_id      UUID,
  days             TEXT[],
  date_from        DATE NOT NULL,
  date_to          DATE NOT NULL,
  time_window      TEXT NOT NULL DEFAULT 'any',
  timezone         TEXT,
  status           TEXT NOT NULL DEFAULT 'waiting',
  offers_count     INTEGER NOT NULL DEFAULT 0,
  last_offered_at  TIMESTAMPTZ,
  booking_id       UUID,
  booked_at        TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  consent_text     TEXT,
  consent_at       TIMESTAMPTZ,
  consent_ip       TEXT,
  source           TEXT NOT NULL DEFAULT 'page',
  removed_at       TIMESTAMPTZ,
  removed_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Columns any hand-made table lacks.
ALTER TABLE public.booking_waitlist
  ADD COLUMN IF NOT EXISTS contact_id       UUID,
  ADD COLUMN IF NOT EXISTS conversation_id  UUID,
  ADD COLUMN IF NOT EXISTS customer_email   TEXT,
  ADD COLUMN IF NOT EXISTS location_id      UUID,
  ADD COLUMN IF NOT EXISTS days             TEXT[],
  ADD COLUMN IF NOT EXISTS time_window      TEXT NOT NULL DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS timezone         TEXT,
  ADD COLUMN IF NOT EXISTS status           TEXT NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS offers_count     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_offered_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booking_id       UUID,
  ADD COLUMN IF NOT EXISTS booked_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_text     TEXT,
  ADD COLUMN IF NOT EXISTS consent_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_ip       TEXT,
  ADD COLUMN IF NOT EXISTS source           TEXT NOT NULL DEFAULT 'page',
  ADD COLUMN IF NOT EXISTS removed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by       TEXT,
  ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS booking_waitlist_live_idx ON public.booking_waitlist (company_id, service_id, created_at)
  WHERE status IN ('waiting', 'offered');
CREATE INDEX IF NOT EXISTS booking_waitlist_company_idx ON public.booking_waitlist (company_id, created_at DESC);
-- One live entry per person per service: joining again updates it.
CREATE UNIQUE INDEX IF NOT EXISTS booking_waitlist_one_live_uniq ON public.booking_waitlist (company_id, service_id, phone_norm)
  WHERE status IN ('waiting', 'offered');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_waitlist_status_check') THEN
    ALTER TABLE public.booking_waitlist ADD CONSTRAINT booking_waitlist_status_check
      CHECK (status IN ('waiting', 'offered', 'booked', 'expired', 'removed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_waitlist_window_check') THEN
    ALTER TABLE public.booking_waitlist ADD CONSTRAINT booking_waitlist_window_check
      CHECK (time_window IN ('any', 'morning', 'afternoon'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_waitlist_dates_check') THEN
    ALTER TABLE public.booking_waitlist ADD CONSTRAINT booking_waitlist_dates_check
      CHECK (date_to >= date_from AND date_to <= date_from + 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_waitlist_days_check') THEN
    ALTER TABLE public.booking_waitlist ADD CONSTRAINT booking_waitlist_days_check
      CHECK (days IS NULL OR cardinality(days) BETWEEN 1 AND 31);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_waitlist_text_len') THEN
    ALTER TABLE public.booking_waitlist ADD CONSTRAINT booking_waitlist_text_len
      CHECK (char_length(customer_name) <= 120 AND char_length(customer_phone) <= 40
         AND (customer_email IS NULL OR char_length(customer_email) <= 200)
         AND (consent_text IS NULL OR char_length(consent_text) <= 1000));
  END IF;
END $$;

-- ── STEP 2: the offers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_waitlist_offers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entry_id         UUID NOT NULL REFERENCES public.booking_waitlist(id) ON DELETE CASCADE,
  service_id       UUID,
  slot_start       TIMESTAMPTZ NOT NULL,
  slot_end         TIMESTAMPTZ,
  location_id      UUID,
  token            TEXT NOT NULL,
  mode             TEXT NOT NULL DEFAULT 'first',
  status           TEXT NOT NULL DEFAULT 'sending',
  channel          TEXT,
  sent_at          TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  claimed_at       TIMESTAMPTZ,
  booking_id       UUID,
  hold_booking_id  UUID,
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.booking_waitlist_offers
  ADD COLUMN IF NOT EXISTS service_id       UUID,
  ADD COLUMN IF NOT EXISTS slot_end         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location_id      UUID,
  ADD COLUMN IF NOT EXISTS mode             TEXT NOT NULL DEFAULT 'first',
  ADD COLUMN IF NOT EXISTS status           TEXT NOT NULL DEFAULT 'sending',
  ADD COLUMN IF NOT EXISTS channel          TEXT,
  ADD COLUMN IF NOT EXISTS sent_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booking_id       UUID,
  ADD COLUMN IF NOT EXISTS hold_booking_id  UUID,
  ADD COLUMN IF NOT EXISTS error            TEXT,
  ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS booking_waitlist_offers_token_uniq ON public.booking_waitlist_offers (token);
-- Nobody is offered the same time twice.
CREATE UNIQUE INDEX IF NOT EXISTS booking_waitlist_offers_once_uniq ON public.booking_waitlist_offers (entry_id, slot_start);
CREATE INDEX IF NOT EXISTS booking_waitlist_offers_slot_idx ON public.booking_waitlist_offers (company_id, service_id, slot_start);
CREATE INDEX IF NOT EXISTS booking_waitlist_offers_live_idx ON public.booking_waitlist_offers (expires_at)
  WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS booking_waitlist_offers_booking_idx ON public.booking_waitlist_offers (booking_id)
  WHERE booking_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_waitlist_offers_status_check') THEN
    ALTER TABLE public.booking_waitlist_offers ADD CONSTRAINT booking_waitlist_offers_status_check
      CHECK (status IN ('sending', 'sent', 'claimed', 'gone', 'expired', 'failed', 'skipped'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_waitlist_offers_mode_check') THEN
    ALTER TABLE public.booking_waitlist_offers ADD CONSTRAINT booking_waitlist_offers_mode_check
      CHECK (mode IN ('first', 'order'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_waitlist_offers_token_len') THEN
    ALTER TABLE public.booking_waitlist_offers ADD CONSTRAINT booking_waitlist_offers_token_len
      CHECK (char_length(token) BETWEEN 20 AND 80);
  END IF;
END $$;

-- ── STEP 3: the work queue ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_waitlist_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  service_id   UUID,
  staff_id     UUID,
  from_at      TIMESTAMPTZ,
  until_at     TIMESTAMPTZ,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status       TEXT NOT NULL DEFAULT 'queued',
  run_after    TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts     INTEGER NOT NULL DEFAULT 0,
  claimed_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  result       JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.booking_waitlist_jobs
  ADD COLUMN IF NOT EXISTS service_id   UUID,
  ADD COLUMN IF NOT EXISTS staff_id     UUID,
  ADD COLUMN IF NOT EXISTS from_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS until_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS run_after    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS attempts     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claimed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finished_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS result       JSONB,
  ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS booking_waitlist_jobs_queue_idx ON public.booking_waitlist_jobs (run_after)
  WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS booking_waitlist_jobs_company_idx ON public.booking_waitlist_jobs (company_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_waitlist_jobs_kind_check') THEN
    ALTER TABLE public.booking_waitlist_jobs ADD CONSTRAINT booking_waitlist_jobs_kind_check
      CHECK (kind IN ('slot_freed', 'availability', 'manual', 'advance'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_waitlist_jobs_status_check') THEN
    ALTER TABLE public.booking_waitlist_jobs ADD CONSTRAINT booking_waitlist_jobs_status_check
      CHECK (status IN ('queued', 'running', 'done', 'failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_waitlist_jobs_payload_size') THEN
    ALTER TABLE public.booking_waitlist_jobs ADD CONSTRAINT booking_waitlist_jobs_payload_size
      CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 262144);
  END IF;
END $$;

-- ── STEP 4: access ──────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  t TEXT;
  member_ok BOOLEAN := to_regprocedure('public.is_company_member(uuid)') IS NOT NULL
    AND pg_get_functiondef(to_regprocedure('public.is_company_member(uuid)')) ILIKE '%''viewer''%';
BEGIN
  FOREACH t IN ARRAY ARRAY['booking_waitlist', 'booking_waitlist_offers', 'booking_waitlist_jobs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
  IF member_ok THEN
    CREATE POLICY booking_waitlist_member_read ON public.booking_waitlist
      FOR SELECT TO authenticated USING (is_company_member(company_id) OR is_platform_admin());
    GRANT SELECT ON public.booking_waitlist TO authenticated;
    CREATE POLICY booking_waitlist_offers_member_read ON public.booking_waitlist_offers
      FOR SELECT TO authenticated USING (is_company_member(company_id) OR is_platform_admin());
    GRANT SELECT ON public.booking_waitlist_offers TO authenticated;
  ELSE
    RAISE NOTICE 'is_company_member() is missing or still counts board visitors: booking_waitlist and booking_waitlist_offers are server only. Run COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql, then this file again.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 5: check ───────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('booking_waitlist', 'booking_waitlist_offers', 'booking_waitlist_jobs')
 ORDER BY tablename, policyname;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- The waitlist goes away (the code keeps working without the tables: joining
-- says it isn't available, nothing is queued, the admin tab says to run this
-- file). Bookings already made from an offer stay, with source 'waitlist'.
-- Release any in-order holds still pending first, so their times free up now
-- rather than when the hold lapses:
--
--   UPDATE public.bookings SET status = 'expired' WHERE status = 'pending' AND source = 'waitlist_hold';
--   DROP TABLE IF EXISTS public.booking_waitlist_jobs;
--   DROP TABLE IF EXISTS public.booking_waitlist_offers;
--   DROP TABLE IF EXISTS public.booking_waitlist;
--   NOTIFY pgrst, 'reload schema';
