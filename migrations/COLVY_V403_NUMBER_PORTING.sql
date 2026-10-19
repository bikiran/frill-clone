-- ============================================================
-- COLVY V403 — NUMBER PORTING REQUESTS
--
-- A business can ask to move ("port") an existing Australian number to Colvy
-- (Settings → Calls & SMS → Move your number to Colvy). Porting to Twilio in
-- Australia is a managed process, not a self-serve API, so it's a request:
-- the business sends the account details, a recent bill and a signed Letter of
-- Authority; the Colvy team lodges it with the carriers (Platform admin →
-- Number porting) and, when the number arrives on the platform Twilio account,
-- attaches it to the business exactly like a bought number (lib/number-
-- porting-server attachPortedNumber → lib/platform-number).
--
-- Creates:
--   porting_requests          one row per request
--     company_id                the business
--     status                    submitted | in_review | submitted_to_carrier |
--                               scheduled | completed | rejected | cancelled
--                               (transitions are enforced by the server,
--                               lib/number-porting PORT_TRANSITIONS)
--     numbers                   text[] of E.164 numbers to move (1–20)
--     current_carrier, account_holder, account_number, service_address, abn
--     contact_name, contact_email, contact_phone   who the team deals with
--     loa_signed_name, loa_text, loa_version, loa_accepted_at
--                               the Letter of Authority as signed (typed name +
--                               consent box), with the exact wording shown
--     preferred_date, scheduled_for, carrier_reference, rejection_reason
--     port_fee_aud, monthly_price_aud              what the business was shown
--     billing_status            not_started | pending | active | manual | waived
--     stripe_checkout_session_id, stripe_subscription_id   the ported numbers'
--                               subscription, once the business starts it
--     attached                  {"+61…": {"sid": "PN…", "phone_number_id": …, "at": …}}
--     created_by, submitted_at, submitted_to_carrier_at, completed_at,
--     created_at, updated_at
--   porting_request_files     documents (the bill, anything asked for later):
--                             metadata here, the file in the PRIVATE storage
--                             bucket porting-documents, only ever handed out as
--                             10-minute signed links by the server
--   porting_request_events    every status change and note; `internal` notes
--                             are the Colvy team's own
--   storage bucket porting-documents (private), when the storage schema is
--   there; the server also creates it on first upload.
--
-- Access (V375 / V382 / V398 / V399 style):
--   • SELECT — staff of the company (is_company_member: owner and team, not
--     board visitors, not removed members) and the platform admin. Staff never
--     see internal events (porting_request_events.internal = false only).
--   • INSERT / UPDATE / DELETE — the server only (service role). Owners and
--     admins send and cancel requests through /api/phone-porting, which checks
--     requireCompanyAdmin; the platform admin works the queue through
--     /api/platform-admin/porting. No write policy and no write privilege for
--     anon or authenticated.
--   If is_company_member() is missing, or is still V209's first version, the
--   tables are created SERVER ONLY (no read policy) and a notice says so; the
--   app reads them with the service role either way. Run V337 and then this
--   file again to add the read policies.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- Any time, before or after the code from branch claude/phone-extras is
-- deployed. Until it runs, the Calls & SMS card says port requests aren't
-- switched on yet and to email support, sending a request is refused with a
-- plain message, and the platform admin queue says to run this file. Nothing
-- else depends on these tables.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. The last query lists three policies, one per table, all SELECT.
--   2. Settings → Calls & SMS → Request a port: fill it in with a PDF bill and
--      send. It shows as Submitted; you get an email; Platform admin → Number
--      porting lists it with the bill.
--   3. Signed in as staff (anon key + their token):
--        select * from porting_requests;                → their business's rows only
--        select * from porting_request_events;          → no internal rows
--        insert into porting_requests (company_id, numbers) ...;  → permission denied
--   4. select id, public from storage.buckets where id = 'porting-documents';  → public = false
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

-- The platform admin check (same body as V351 / V364 / V375 / V395 / V398 / V399).
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

-- ── STEP 1: requests ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.porting_requests (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status                      TEXT NOT NULL DEFAULT 'submitted',
  numbers                     TEXT[] NOT NULL DEFAULT '{}',
  current_carrier             TEXT,
  account_holder              TEXT,
  account_number              TEXT,
  service_address             TEXT,
  abn                         TEXT,
  contact_name                TEXT,
  contact_email               TEXT,
  contact_phone               TEXT,
  loa_signed_name             TEXT,
  loa_text                    TEXT,
  loa_version                 TEXT,
  loa_accepted_at             TIMESTAMPTZ,
  preferred_date              DATE,
  scheduled_for               DATE,
  carrier_reference           TEXT,
  rejection_reason            TEXT,
  port_fee_aud                NUMERIC(10,2) NOT NULL DEFAULT 0,
  monthly_price_aud           NUMERIC(10,2) NOT NULL DEFAULT 0,
  billing_status              TEXT NOT NULL DEFAULT 'not_started',
  stripe_checkout_session_id  TEXT,
  stripe_subscription_id      TEXT,
  attached                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by                  UUID,
  submitted_at                TIMESTAMPTZ,
  submitted_to_carrier_at     TIMESTAMPTZ,
  completed_at                TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Columns any hand-made table lacks.
ALTER TABLE public.porting_requests
  ADD COLUMN IF NOT EXISTS status                      TEXT NOT NULL DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS numbers                     TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS current_carrier             TEXT,
  ADD COLUMN IF NOT EXISTS account_holder              TEXT,
  ADD COLUMN IF NOT EXISTS account_number              TEXT,
  ADD COLUMN IF NOT EXISTS service_address             TEXT,
  ADD COLUMN IF NOT EXISTS abn                         TEXT,
  ADD COLUMN IF NOT EXISTS contact_name                TEXT,
  ADD COLUMN IF NOT EXISTS contact_email               TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone               TEXT,
  ADD COLUMN IF NOT EXISTS loa_signed_name             TEXT,
  ADD COLUMN IF NOT EXISTS loa_text                    TEXT,
  ADD COLUMN IF NOT EXISTS loa_version                 TEXT,
  ADD COLUMN IF NOT EXISTS loa_accepted_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS preferred_date              DATE,
  ADD COLUMN IF NOT EXISTS scheduled_for               DATE,
  ADD COLUMN IF NOT EXISTS carrier_reference           TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason            TEXT,
  ADD COLUMN IF NOT EXISTS port_fee_aud                NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_price_aud           NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_status              TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id  TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id      TEXT,
  ADD COLUMN IF NOT EXISTS attached                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by                  UUID,
  ADD COLUMN IF NOT EXISTS submitted_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_to_carrier_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS porting_requests_company_idx ON public.porting_requests (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS porting_requests_status_idx ON public.porting_requests (status, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'porting_requests_status_check') THEN
    ALTER TABLE public.porting_requests ADD CONSTRAINT porting_requests_status_check
      CHECK (status IN ('submitted', 'in_review', 'submitted_to_carrier', 'scheduled', 'completed', 'rejected', 'cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'porting_requests_billing_check') THEN
    ALTER TABLE public.porting_requests ADD CONSTRAINT porting_requests_billing_check
      CHECK (billing_status IN ('not_started', 'pending', 'active', 'manual', 'waived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'porting_requests_numbers_check') THEN
    ALTER TABLE public.porting_requests ADD CONSTRAINT porting_requests_numbers_check
      CHECK (cardinality(numbers) BETWEEN 1 AND 20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'porting_requests_numbers_e164') THEN
    -- Every entry is an Australian E.164 number (array_to_string joins them).
    ALTER TABLE public.porting_requests ADD CONSTRAINT porting_requests_numbers_e164
      CHECK (array_to_string(numbers, ',') ~ '^(\+61[0-9]{9,10})(,\+61[0-9]{9,10})*$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'porting_requests_abn_check') THEN
    ALTER TABLE public.porting_requests ADD CONSTRAINT porting_requests_abn_check
      CHECK (abn IS NULL OR abn ~ '^[0-9]{11}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'porting_requests_fees_check') THEN
    ALTER TABLE public.porting_requests ADD CONSTRAINT porting_requests_fees_check
      CHECK (port_fee_aud >= 0 AND monthly_price_aud >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'porting_requests_attached_object') THEN
    ALTER TABLE public.porting_requests ADD CONSTRAINT porting_requests_attached_object
      CHECK (jsonb_typeof(attached) = 'object');
  END IF;
END $$;

-- ── STEP 2: documents ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.porting_request_files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES public.porting_requests(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL DEFAULT 'bill',
  file_name       TEXT,
  content_type    TEXT,
  size_bytes      BIGINT,
  storage_bucket  TEXT NOT NULL DEFAULT 'porting-documents',
  storage_path    TEXT NOT NULL,
  uploaded_by     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.porting_request_files
  ADD COLUMN IF NOT EXISTS kind            TEXT NOT NULL DEFAULT 'bill',
  ADD COLUMN IF NOT EXISTS file_name       TEXT,
  ADD COLUMN IF NOT EXISTS content_type    TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes      BIGINT,
  ADD COLUMN IF NOT EXISTS storage_bucket  TEXT NOT NULL DEFAULT 'porting-documents',
  ADD COLUMN IF NOT EXISTS uploaded_by     UUID,
  ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS porting_request_files_request_idx ON public.porting_request_files (request_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'porting_request_files_kind_check') THEN
    ALTER TABLE public.porting_request_files ADD CONSTRAINT porting_request_files_kind_check
      CHECK (kind IN ('bill', 'loa', 'other'));
  END IF;
END $$;

-- ── STEP 3: history ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.porting_request_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   UUID NOT NULL REFERENCES public.porting_requests(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_status  TEXT,
  to_status    TEXT,
  note         TEXT,
  internal     BOOLEAN NOT NULL DEFAULT false,
  actor_id     UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.porting_request_events
  ADD COLUMN IF NOT EXISTS from_status  TEXT,
  ADD COLUMN IF NOT EXISTS to_status    TEXT,
  ADD COLUMN IF NOT EXISTS note         TEXT,
  ADD COLUMN IF NOT EXISTS internal     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS actor_id     UUID,
  ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS porting_request_events_request_idx ON public.porting_request_events (request_id, created_at);

-- ── STEP 4: the private bucket ──────────────────────────────────────────────
-- Private (no public URL) and no storage policies: only the service role
-- reads or writes it. Forced private even if someone made it public.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage.buckets does not exist: skipping the bucket. The server creates porting-documents (private) on first upload.';
  ELSE
    INSERT INTO storage.buckets (id, name, public) VALUES ('porting-documents', 'porting-documents', false)
    ON CONFLICT (id) DO UPDATE SET public = false;
  END IF;
END $$;

-- ── STEP 5: access ──────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  t TEXT;
  member_ok BOOLEAN := to_regprocedure('public.is_company_member(uuid)') IS NOT NULL
    AND pg_get_functiondef(to_regprocedure('public.is_company_member(uuid)')) ILIKE '%''viewer''%';
BEGIN
  FOREACH t IN ARRAY ARRAY['porting_requests', 'porting_request_files', 'porting_request_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
  IF member_ok THEN
    CREATE POLICY porting_requests_member_read ON public.porting_requests
      FOR SELECT TO authenticated USING (is_company_member(company_id) OR is_platform_admin());
    CREATE POLICY porting_request_files_member_read ON public.porting_request_files
      FOR SELECT TO authenticated USING (is_company_member(company_id) OR is_platform_admin());
    CREATE POLICY porting_request_events_member_read ON public.porting_request_events
      FOR SELECT TO authenticated USING ((is_company_member(company_id) AND NOT internal) OR is_platform_admin());
    GRANT SELECT ON public.porting_requests, public.porting_request_files, public.porting_request_events TO authenticated;
  ELSE
    RAISE NOTICE 'is_company_member() is missing or still counts board visitors: the porting tables are server only. Run COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql, then this file again.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 6: check ───────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('porting_requests', 'porting_request_files', 'porting_request_events')
 ORDER BY tablename;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Port requests go back to "email support" (the code keeps working without
-- the tables). Numbers already attached stay attached: they're ordinary
-- phone_numbers rows. Dropping the tables loses the request history and the
-- signed authorities, so export them first if you need them. Files in the
-- porting-documents bucket are not deleted by this; empty the bucket in
-- Storage if you want them gone.
--
--   DROP TABLE IF EXISTS public.porting_request_events;
--   DROP TABLE IF EXISTS public.porting_request_files;
--   DROP TABLE IF EXISTS public.porting_requests;
--   NOTIFY pgrst, 'reload schema';
