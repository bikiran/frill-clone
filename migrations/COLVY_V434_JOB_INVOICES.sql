-- ============================================================
-- COLVY V434 — JOBS & SERVICES: INVOICES
--
-- Quote → deposit → job → sign-off, then the invoice for the balance. An
-- invoice is made from the job (its accepted quote's items, less a deposit
-- already paid) or from scratch, sent as a private link the customer pays by
-- card, and chased with reminders when it's overdue. Cash and bank transfers
-- are recorded by the team. Payments are the source of truth: an invoice's
-- paid amount is always the sum of its payment rows, worked out under a lock.
--
-- Creates:
--   job_counters.last_invoice      INV- numbers, per business
--   job_invoices                   the invoices
--   job_invoice_payments           what's been paid against each one
--   colvy_next_job_number(...)     now also hands out 'invoice' numbers
--   colvy_invoice_payment(...)     add or remove a payment, in one locked
--                                  transaction (a card payment counts once)
--
-- Access: server only, like V427. RLS on, no grants to anon or authenticated.
--
-- Needs V427 (and V428) first. Run in the Supabase SQL editor. Safe to re-run.
-- Rollback at the bottom.
-- ============================================================

ALTER TABLE public.job_counters ADD COLUMN IF NOT EXISTS last_invoice INT NOT NULL DEFAULT 1000;

-- ── Invoices ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id             UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  quote_id           UUID REFERENCES public.job_quotes(id) ON DELETE SET NULL,   -- the quote it was made from
  number             INT  NOT NULL,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','void')),
  title              TEXT,
  intro              TEXT,
  terms              TEXT,          -- payment details and notes, printed at the bottom
  items              JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
  discount_type      TEXT NOT NULL DEFAULT 'none' CHECK (discount_type IN ('none','fixed','percent')),
  discount_value     NUMERIC(12,2) NOT NULL DEFAULT 0,
  prices_include_tax BOOLEAN NOT NULL DEFAULT false,
  tax_rate           NUMERIC(5,2) NOT NULL DEFAULT 10,
  gross_cents        BIGINT NOT NULL DEFAULT 0,
  discount_cents     BIGINT NOT NULL DEFAULT 0,
  subtotal_cents     BIGINT NOT NULL DEFAULT 0,   -- excluding GST, after discount
  tax_cents          BIGINT NOT NULL DEFAULT 0,
  total_cents        BIGINT NOT NULL DEFAULT 0,   -- the invoice total, incl. GST
  credit_cents       BIGINT NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),   -- a deposit already paid on the quote
  credit_label       TEXT,
  paid_cents         BIGINT NOT NULL DEFAULT 0,   -- the sum of job_invoice_payments (kept by colvy_invoice_payment)
  issue_date         DATE,
  due_date           DATE,
  public_token       TEXT,
  sent_at            TIMESTAMPTZ,
  sent_via           TEXT,
  viewed_at          TIMESTAMPTZ,
  paid_at            TIMESTAMPTZ,
  voided_at          TIMESTAMPTZ,
  void_reason        TEXT,
  pay_payment_id     UUID,          -- chat_payments.id of the newest card payment link
  reminders          BOOLEAN NOT NULL DEFAULT true,
  reminder_count     INT NOT NULL DEFAULT 0,
  last_reminder_at   TIMESTAMPTZ,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS job_invoices_number_uniq ON public.job_invoices (company_id, number);
CREATE UNIQUE INDEX IF NOT EXISTS job_invoices_token_uniq ON public.job_invoices (public_token) WHERE public_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS job_invoices_job_idx ON public.job_invoices (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_invoices_company_status_idx ON public.job_invoices (company_id, status, due_date);
CREATE INDEX IF NOT EXISTS job_invoices_reminders_idx ON public.job_invoices (status, due_date) WHERE status = 'sent' AND reminders;
CREATE INDEX IF NOT EXISTS job_invoices_pay_payment_idx ON public.job_invoices (pay_payment_id) WHERE pay_payment_id IS NOT NULL;

-- ── Payments against an invoice ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_invoice_payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id       UUID NOT NULL REFERENCES public.job_invoices(id) ON DELETE CASCADE,
  job_id           UUID NOT NULL,
  amount_cents     BIGINT NOT NULL CHECK (amount_cents > 0),
  method           TEXT NOT NULL DEFAULT 'other' CHECK (method IN ('card','cash','bank_transfer','cheque','other')),
  payment_id       UUID,          -- chat_payments.id, for a card payment through the invoice link
  note             TEXT,
  paid_on          DATE,
  recorded_by      UUID,
  recorded_by_name TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS job_invoice_payments_payment_uniq ON public.job_invoice_payments (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS job_invoice_payments_invoice_idx ON public.job_invoice_payments (invoice_id, created_at);

-- ── Numbers: J-, Q- and now INV- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.colvy_next_job_number(p_company UUID, p_kind TEXT)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v INT;
BEGIN
  IF p_kind NOT IN ('job','quote','invoice') THEN RAISE EXCEPTION 'kind must be job, quote or invoice'; END IF;
  INSERT INTO job_counters (company_id, last_job, last_quote, last_invoice)
  VALUES (p_company,
    CASE WHEN p_kind = 'job' THEN 1001 ELSE 1000 END,
    CASE WHEN p_kind = 'quote' THEN 1001 ELSE 1000 END,
    CASE WHEN p_kind = 'invoice' THEN 1001 ELSE 1000 END)
  ON CONFLICT (company_id) DO UPDATE SET
    last_job     = job_counters.last_job     + CASE WHEN p_kind = 'job'     THEN 1 ELSE 0 END,
    last_quote   = job_counters.last_quote   + CASE WHEN p_kind = 'quote'   THEN 1 ELSE 0 END,
    last_invoice = job_counters.last_invoice + CASE WHEN p_kind = 'invoice' THEN 1 ELSE 0 END
  RETURNING CASE p_kind WHEN 'job' THEN last_job WHEN 'quote' THEN last_quote ELSE last_invoice END INTO v;
  RETURN v;
END $$;

-- ── Add or remove a payment, under the invoice's lock ────────────────────────
-- p_action 'add': p_cents by p_method. A card payment passes its chat_payments
--   id (p_payment) and counts once however often it's reported (webhook and
--   the return page both settle it). A recorded payment can't be more than
--   what's owing; a card payment is recorded as Stripe took it.
-- p_action 'remove': deletes a recorded (not card) payment, p_row.
-- Either way paid_cents is worked out again from the payment rows, and the
-- invoice is Paid once nothing is owing (Sent again if a removal reopens it).
CREATE OR REPLACE FUNCTION public.colvy_invoice_payment(
  p_invoice UUID, p_action TEXT, p_cents BIGINT, p_method TEXT, p_payment UUID, p_row UUID,
  p_note TEXT, p_paid_on DATE, p_actor UUID, p_actor_name TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv job_invoices%ROWTYPE;
  v_owing BIGINT;
  v_paid BIGINT;
  v_status TEXT;
  v_row UUID;
  v_amount BIGINT;
BEGIN
  SELECT * INTO inv FROM job_invoices WHERE id = p_invoice FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF inv.status NOT IN ('sent','paid') THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_open', 'status', inv.status); END IF;
  v_owing := GREATEST(0, inv.total_cents - inv.credit_cents - inv.paid_cents);

  IF p_action = 'add' THEN
    IF p_payment IS NOT NULL AND EXISTS (SELECT 1 FROM job_invoice_payments WHERE payment_id = p_payment) THEN
      RETURN jsonb_build_object('ok', true, 'already', true, 'status', inv.status, 'paid_cents', inv.paid_cents,
        'balance_cents', v_owing, 'company_id', inv.company_id, 'job_id', inv.job_id, 'number', inv.number);
    END IF;
    IF p_cents IS NULL OR p_cents <= 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'bad_amount'); END IF;
    IF p_payment IS NULL THEN
      IF v_owing <= 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'nothing_owing', 'status', inv.status); END IF;
      IF p_cents > v_owing THEN RETURN jsonb_build_object('ok', false, 'reason', 'too_much', 'balance_cents', v_owing); END IF;
    END IF;
    INSERT INTO job_invoice_payments (company_id, invoice_id, job_id, amount_cents, method, payment_id, note, paid_on, recorded_by, recorded_by_name)
    VALUES (inv.company_id, inv.id, inv.job_id, p_cents,
      CASE WHEN p_method IN ('card','cash','bank_transfer','cheque','other') THEN p_method ELSE 'other' END,
      p_payment, left(p_note, 500), COALESCE(p_paid_on, CURRENT_DATE), p_actor, left(p_actor_name, 120))
    RETURNING id INTO v_row;
    v_amount := p_cents;
  ELSIF p_action = 'remove' THEN
    DELETE FROM job_invoice_payments WHERE id = p_row AND invoice_id = inv.id AND payment_id IS NULL
    RETURNING id, amount_cents INTO v_row, v_amount;
    IF v_row IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_found'); END IF;
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_action');
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_paid FROM job_invoice_payments WHERE invoice_id = inv.id;
  v_status := CASE WHEN v_paid >= GREATEST(0, inv.total_cents - inv.credit_cents) THEN 'paid' ELSE 'sent' END;
  UPDATE job_invoices SET paid_cents = v_paid, status = v_status,
    paid_at = CASE WHEN v_status = 'paid' THEN COALESCE(inv.paid_at, now()) ELSE NULL END,
    updated_at = now()
  WHERE id = inv.id;

  RETURN jsonb_build_object('ok', true, 'row_id', v_row, 'amount_cents', v_amount, 'status', v_status, 'was', inv.status,
    'just_paid', inv.status <> 'paid' AND v_status = 'paid',
    'paid_cents', v_paid, 'balance_cents', GREATEST(0, inv.total_cents - inv.credit_cents - v_paid),
    'company_id', inv.company_id, 'job_id', inv.job_id, 'number', inv.number);
END $$;

-- ── Access: server only ──────────────────────────────────────────────────────
DO $$ DECLARE t TEXT; r RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['job_invoices','job_invoice_payments'] LOOP
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
REVOKE ALL ON FUNCTION public.colvy_invoice_payment(UUID, TEXT, BIGINT, TEXT, UUID, UUID, TEXT, DATE, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.colvy_invoice_payment(UUID, TEXT, BIGINT, TEXT, UUID, UUID, TEXT, DATE, UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Verify afterwards (should list both tables):
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
--   AND table_name IN ('job_invoices','job_invoice_payments');

-- ── Rollback ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.colvy_invoice_payment(UUID, TEXT, BIGINT, TEXT, UUID, UUID, TEXT, DATE, UUID, TEXT);
-- DROP TABLE IF EXISTS public.job_invoice_payments, public.job_invoices;
-- ALTER TABLE public.job_counters DROP COLUMN IF EXISTS last_invoice;
-- (and re-run the colvy_next_job_number definition from COLVY_V427_JOBS.sql)
