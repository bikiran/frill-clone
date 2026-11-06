-- ============================================================
-- COLVY V427 — JOBS & SERVICES (PHASE 1: QUOTES AND JOBS)
--
-- For removalists, cleaners, electricians, plumbers and other trades. A job
-- links to the customer (contacts), the conversation, the booking or the form
-- response it came from. Quotes are itemised with Australian GST, sent as a
-- link the customer accepts or declines, and can ask for a deposit through
-- Colvy's existing payment links (chat_payments). docs/plans/jobs.md has the
-- full plan.
--
-- Creates:
--   companies.modules       per-business module switches { jobs, restaurant }
--   companies.job_settings  GST, numbering, default terms and deposit
--   job_counters            per-business J-/Q- numbers, handed out atomically
--   jobs, job_quotes, job_price_items, job_quote_templates, job_events
--   colvy_next_job_number(company, kind)   the next job or quote number
--   colvy_quote_decide(...)                accept / decline a quote in one
--                                          locked transaction
--
-- Access: server only. Every table has RLS on and no grants to anon or
-- authenticated; the app reads and writes through /api/jobs/*, which checks
-- workspace membership and the "jobs" permission.
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS modules JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS job_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ── Numbers ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_counters (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  last_job   INT NOT NULL DEFAULT 1000,
  last_quote INT NOT NULL DEFAULT 1000
);

-- ── Jobs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number           INT  NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new','quoting','awaiting_approval','scheduled','in_progress','completed','cancelled')),
  source           TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','conversation','booking','form')),
  contact_id       UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id  UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  booking_id       UUID,          -- bookings.id when made from a booking
  form_id          UUID,          -- forms.id when made from a form response
  form_response_id UUID,          -- form_responses.id
  address          TEXT,
  scheduled_start  TIMESTAMPTZ,
  scheduled_end    TIMESTAMPTZ,
  accepted_quote_id UUID,
  value_cents      BIGINT,        -- the accepted quote's total
  fields           JSONB NOT NULL DEFAULT '{}'::jsonb,   -- industry fields (later phases)
  sort_order       DOUBLE PRECISION NOT NULL DEFAULT 0,
  create_key       TEXT,          -- the "create" click, so a double click makes one job
  cancel_reason    TEXT,
  created_by       UUID,
  created_by_name  TEXT,
  closed_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_company_number_uniq ON public.jobs (company_id, number);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_company_create_key_uniq ON public.jobs (company_id, create_key) WHERE create_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS jobs_company_booking_uniq ON public.jobs (company_id, booking_id) WHERE booking_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS jobs_company_form_response_uniq ON public.jobs (company_id, form_response_id) WHERE form_response_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_company_status_idx ON public.jobs (company_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS jobs_company_contact_idx ON public.jobs (company_id, contact_id);
CREATE INDEX IF NOT EXISTS jobs_company_scheduled_idx ON public.jobs (company_id, scheduled_start);

-- ── Quotes ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_quotes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id             UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  number             INT  NOT NULL,
  revision           INT  NOT NULL DEFAULT 1,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','declined','withdrawn')),
  title              TEXT,
  intro              TEXT,
  terms              TEXT,
  items              JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
  discount_type      TEXT NOT NULL DEFAULT 'none' CHECK (discount_type IN ('none','fixed','percent')),
  discount_value     NUMERIC(12,2) NOT NULL DEFAULT 0,
  prices_include_tax BOOLEAN NOT NULL DEFAULT false,
  tax_rate           NUMERIC(5,2) NOT NULL DEFAULT 10,
  gross_cents        BIGINT NOT NULL DEFAULT 0,
  discount_cents     BIGINT NOT NULL DEFAULT 0,
  subtotal_cents     BIGINT NOT NULL DEFAULT 0,   -- excluding GST, after discount
  tax_cents          BIGINT NOT NULL DEFAULT 0,
  total_cents        BIGINT NOT NULL DEFAULT 0,
  deposit_type       TEXT NOT NULL DEFAULT 'none' CHECK (deposit_type IN ('none','fixed','percent')),
  deposit_value      NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposit_cents      BIGINT NOT NULL DEFAULT 0,
  deposit_status     TEXT NOT NULL DEFAULT 'none' CHECK (deposit_status IN ('none','requested','paid','refunded')),
  deposit_payment_id UUID,        -- chat_payments.id
  deposit_paid_at    TIMESTAMPTZ,
  valid_until        DATE,
  public_token       TEXT,
  sent_at            TIMESTAMPTZ,
  sent_via           TEXT,
  viewed_at          TIMESTAMPTZ,
  accepted_at        TIMESTAMPTZ,
  declined_at        TIMESTAMPTZ,
  decided_name       TEXT,
  decided_note       TEXT,
  decided_ip         TEXT,
  decided_user_agent TEXT,
  decided_by_type    TEXT,        -- 'customer' (the link) or 'staff' (accepted by phone)
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS job_quotes_number_rev_uniq ON public.job_quotes (company_id, number, revision);
CREATE UNIQUE INDEX IF NOT EXISTS job_quotes_token_uniq ON public.job_quotes (public_token) WHERE public_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS job_quotes_job_idx ON public.job_quotes (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_quotes_company_status_idx ON public.job_quotes (company_id, status);
CREATE INDEX IF NOT EXISTS job_quotes_deposit_payment_idx ON public.job_quotes (deposit_payment_id) WHERE deposit_payment_id IS NOT NULL;

-- ── Price list and templates ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_price_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  kind             TEXT NOT NULL DEFAULT 'labour' CHECK (kind IN ('labour','material','travel','fee','other')),
  unit             TEXT NOT NULL DEFAULT 'each',
  unit_price_cents BIGINT NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
  taxable          BOOLEAN NOT NULL DEFAULT true,
  active           BOOLEAN NOT NULL DEFAULT true,
  sort_order       INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_price_items_company_idx ON public.job_price_items (company_id, sort_order);

CREATE TABLE IF NOT EXISTS public.job_quote_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  title          TEXT,
  intro          TEXT,
  terms          TEXT,
  items          JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
  discount_type  TEXT NOT NULL DEFAULT 'none' CHECK (discount_type IN ('none','fixed','percent')),
  discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposit_type   TEXT NOT NULL DEFAULT 'none' CHECK (deposit_type IN ('none','fixed','percent')),
  deposit_value  NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_quote_templates_company_idx ON public.job_quote_templates (company_id, name);

-- ── Activity timeline (who did what, when) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id     UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  quote_id   UUID,
  type       TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'staff' CHECK (actor_type IN ('staff','customer','system')),
  actor_id   UUID,
  actor_name TEXT,
  summary    TEXT,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_events_job_idx ON public.job_events (job_id, created_at DESC);

-- ── Next number (J-1001, Q-1001), atomically ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.colvy_next_job_number(p_company UUID, p_kind TEXT)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v INT;
BEGIN
  IF p_kind NOT IN ('job','quote') THEN RAISE EXCEPTION 'kind must be job or quote'; END IF;
  INSERT INTO job_counters (company_id, last_job, last_quote)
  VALUES (p_company, CASE WHEN p_kind = 'job' THEN 1001 ELSE 1000 END, CASE WHEN p_kind = 'quote' THEN 1001 ELSE 1000 END)
  ON CONFLICT (company_id) DO UPDATE SET
    last_job   = job_counters.last_job   + CASE WHEN p_kind = 'job'   THEN 1 ELSE 0 END,
    last_quote = job_counters.last_quote + CASE WHEN p_kind = 'quote' THEN 1 ELSE 0 END
  RETURNING CASE WHEN p_kind = 'job' THEN last_job ELSE last_quote END INTO v;
  RETURN v;
END $$;

-- ── Accept / decline a quote, in one locked transaction ──────────────────────
-- p_quote (staff, by id) or p_token (the customer's link). Only a quote that is
-- still "sent" can be decided; a repeat of the same decision is a no-op, so a
-- double click or a retried request can't accept twice. The customer can't
-- accept after valid_until (p_today is "today" in the business's time zone);
-- staff recording a phone acceptance can.
CREATE OR REPLACE FUNCTION public.colvy_quote_decide(
  p_quote UUID, p_token TEXT, p_decision TEXT, p_name TEXT, p_note TEXT,
  p_ip TEXT, p_ua TEXT, p_actor_type TEXT, p_actor_id UUID, p_actor_name TEXT, p_today DATE
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q job_quotes%ROWTYPE; v_job_status TEXT; v_now TIMESTAMPTZ := now();
BEGIN
  IF p_decision NOT IN ('accept','decline') THEN RAISE EXCEPTION 'decision must be accept or decline'; END IF;
  IF p_quote IS NOT NULL THEN
    SELECT * INTO q FROM job_quotes WHERE id = p_quote FOR UPDATE;
  ELSE
    SELECT * INTO q FROM job_quotes WHERE public_token = p_token AND p_token IS NOT NULL AND length(p_token) >= 20 FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  IF (q.status = 'accepted' AND p_decision = 'accept') OR (q.status = 'declined' AND p_decision = 'decline') THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'status', q.status, 'quote_id', q.id, 'job_id', q.job_id, 'company_id', q.company_id);
  END IF;
  IF q.status <> 'sent' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_open', 'status', q.status);
  END IF;
  IF p_decision = 'accept' AND COALESCE(p_actor_type, 'customer') = 'customer'
     AND q.valid_until IS NOT NULL AND p_today IS NOT NULL AND q.valid_until < p_today THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired', 'status', q.status);
  END IF;

  IF p_decision = 'accept' THEN
    UPDATE job_quotes SET status = 'accepted', accepted_at = v_now, decided_name = left(p_name, 120), decided_note = left(p_note, 1000),
      decided_ip = left(p_ip, 64), decided_user_agent = left(p_ua, 300), decided_by_type = COALESCE(p_actor_type, 'customer'), updated_at = v_now
      WHERE id = q.id;
    -- Any other quote still out for this job is replaced by the accepted one.
    UPDATE job_quotes SET status = 'withdrawn', updated_at = v_now WHERE job_id = q.job_id AND id <> q.id AND status = 'sent';
    UPDATE jobs SET accepted_quote_id = q.id, value_cents = q.total_cents,
      status = CASE WHEN status IN ('new','quoting','awaiting_approval') THEN 'scheduled' ELSE status END, updated_at = v_now
      WHERE id = q.job_id RETURNING status INTO v_job_status;
  ELSE
    UPDATE job_quotes SET status = 'declined', declined_at = v_now, decided_name = left(p_name, 120), decided_note = left(p_note, 1000),
      decided_ip = left(p_ip, 64), decided_user_agent = left(p_ua, 300), decided_by_type = COALESCE(p_actor_type, 'customer'), updated_at = v_now
      WHERE id = q.id;
    UPDATE jobs SET status = CASE WHEN status = 'awaiting_approval'
        AND NOT EXISTS (SELECT 1 FROM job_quotes x WHERE x.job_id = q.job_id AND x.status = 'sent') THEN 'quoting' ELSE status END,
      updated_at = v_now
      WHERE id = q.job_id RETURNING status INTO v_job_status;
  END IF;

  INSERT INTO job_events (company_id, job_id, quote_id, type, actor_type, actor_id, actor_name, summary, data)
  VALUES (q.company_id, q.job_id, q.id, CASE WHEN p_decision = 'accept' THEN 'quote_accepted' ELSE 'quote_declined' END,
    CASE WHEN COALESCE(p_actor_type, 'customer') IN ('staff','customer','system') THEN COALESCE(p_actor_type, 'customer') ELSE 'customer' END,
    p_actor_id, left(COALESCE(p_actor_name, p_name), 120),
    CASE WHEN p_decision = 'accept' THEN 'Quote Q-' || q.number || ' accepted' ELSE 'Quote Q-' || q.number || ' declined' END,
    jsonb_build_object('name', left(p_name, 120), 'note', left(p_note, 1000), 'total_cents', q.total_cents));

  RETURN jsonb_build_object('ok', true, 'status', CASE WHEN p_decision = 'accept' THEN 'accepted' ELSE 'declined' END,
    'quote_id', q.id, 'job_id', q.job_id, 'company_id', q.company_id, 'job_status', v_job_status,
    'number', q.number, 'total_cents', q.total_cents);
END $$;

-- ── Access: server only ──────────────────────────────────────────────────────
DO $$ DECLARE t TEXT; r RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['job_counters','jobs','job_quotes','job_price_items','job_quote_templates','job_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.colvy_next_job_number(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.colvy_next_job_number(UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.colvy_quote_decide(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.colvy_quote_decide(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, DATE) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Verify afterwards (should list the six tables):
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
--   AND table_name IN ('job_counters','jobs','job_quotes','job_price_items','job_quote_templates','job_events');

-- ── Rollback ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.colvy_quote_decide(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, DATE);
-- DROP FUNCTION IF EXISTS public.colvy_next_job_number(UUID, TEXT);
-- DROP TABLE IF EXISTS public.job_events, public.job_quote_templates, public.job_price_items, public.job_quotes, public.jobs, public.job_counters;
-- ALTER TABLE public.companies DROP COLUMN IF EXISTS job_settings;
-- ALTER TABLE public.companies DROP COLUMN IF EXISTS modules;
