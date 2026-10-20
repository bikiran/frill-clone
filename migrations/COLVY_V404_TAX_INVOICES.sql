-- ============================================================
-- COLVY V404 — TAX INVOICES FOR WHAT COLVY CHARGES
--
-- Colvy charges Australian businesses (plans, SMS credit and auto top-ups,
-- business and 1800 numbers, porting fees) in AUD with GST included. Every
-- successful charge now gets a Colvy tax invoice the business can open and
-- print from Billing → Billing history, numbered CLV-000001, CLV-000002, …
-- (lib/tax-invoices issues them from the Stripe webhook, or the first time
-- someone opens an older payment). The document is frozen when issued: what
-- was bought, the GST, Colvy's details and the business's details as they
-- were that day. Without COLVY_ABN set the document is a "Receipt", never a
-- "Tax Invoice" (lib/tax-invoice-core).
--
-- Creates:
--   tax_invoices                one row per paid Stripe invoice or payment
--     company_id                  the business billed
--     number, seq                 CLV-000123 and 123: sequential across Colvy,
--                                 given out by issue_tax_invoice only
--     doc_type                    tax_invoice | receipt
--     status                      paid | partially_refunded | refunded
--     source                      subscription | invoice | sms_credit |
--                                 sms_auto_topup | phone_number | porting | payment
--     stripe_invoice_id           UNIQUE (subscription and one-off invoices)
--     stripe_payment_intent_id    UNIQUE (payments with no Stripe invoice, and
--                                 an invoice's own payment)
--     stripe_charge_id, stripe_checkout_session_id, stripe_customer_id,
--     stripe_subscription_id
--     issued_at, paid_at
--     subtotal_cents, discount_cents, total_cents, gst_cents,
--     amount_paid_cents, credit_applied_cents, refunded_cents   (AUD cents)
--     lines                       [{description, quantity, unitCents, amountCents}]
--     supplier, customer          {name, abn, email, address[]} frozen at issue
--     refunds                     [{amountCents, at, reason}]
--     payment_method              "Visa ending 4242"
--     emailed_at, created_at, updated_at
--   tax_invoice_counter         one row: the last number given out
--   issue_tax_invoice(p_company, p_doc)   the only way rows are made: locks
--                               the counter, returns the existing row when the
--                               Stripe invoice / payment already has one (so
--                               two webhooks at once make one invoice and the
--                               numbers have no gaps), otherwise numbers and
--                               inserts it. Service role only.
--   companies.billing_legal_name, billing_abn (11 digits), billing_email,
--   billing_address ({line1, line2, suburb, state, postcode, country})
--                               what the business enters under Billing →
--                               Business details; written by the server
--                               (/api/billing/details), which checks the ABN.
--
-- Access (V375 / V403 style):
--   • tax_invoices SELECT — staff of the company (is_company_member: owner and
--     team, not board visitors) and the platform admin.
--   • INSERT / UPDATE / DELETE — the server only (service role). No write
--     policy and no write privilege for anon or authenticated.
--   • tax_invoice_counter — server only (no policy at all).
--   If is_company_member() is missing, or is still V209's first version, the
--   table is created SERVER ONLY (no read policy) and a notice says so; the
--   app reads it with the service role either way. Run V337 and then this
--   file again to add the read policy.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- Any time, before or after the code from branch claude/tax-invoices is
-- deployed. Until it runs: billing history works as before; opening a payment
-- shows its document built live from Stripe with the Stripe reference instead
-- of a CLV number (nothing is stored or emailed); Business details says it
-- can't be saved yet. Set COLVY_ABN (and COLVY_LEGAL_NAME,
-- COLVY_BILLING_ADDRESS, COLVY_BILLING_EMAIL) in Vercel before customers rely
-- on these as tax invoices.
--
-- To start numbering somewhere other than 1 (e.g. after invoices issued
-- elsewhere), before the first invoice:
--   UPDATE tax_invoice_counter SET last_number = 1000 WHERE id = 1;
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. The last query lists one policy, tax_invoices_member_read, SELECT.
--   2. Billing → Billing history → "Tax invoice" on a paid row opens a document
--      numbered CLV-000001; opening it again shows the same number.
--   3. Signed in as staff (anon key + their token):
--        select number from tax_invoices;                → their business's rows only
--        insert into tax_invoices (company_id) ...;      → permission denied
--        select issue_tax_invoice(...);                  → permission denied
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

-- The platform admin check (same body as V351 / V364 / V375 / V395 / V398 / V399 / V403).
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

-- ── STEP 1: the business's billing details ─────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_legal_name TEXT,
  ADD COLUMN IF NOT EXISTS billing_abn        TEXT,
  ADD COLUMN IF NOT EXISTS billing_email      TEXT,
  ADD COLUMN IF NOT EXISTS billing_address    JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_billing_abn_check') THEN
    -- Clear anything a hand-made column holds that isn't 11 digits, so the check can be added.
    UPDATE public.companies SET billing_abn = NULL WHERE billing_abn IS NOT NULL AND billing_abn !~ '^[0-9]{11}$';
    ALTER TABLE public.companies ADD CONSTRAINT companies_billing_abn_check
      CHECK (billing_abn IS NULL OR billing_abn ~ '^[0-9]{11}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_billing_address_object') THEN
    UPDATE public.companies SET billing_address = NULL WHERE billing_address IS NOT NULL AND jsonb_typeof(billing_address) <> 'object';
    ALTER TABLE public.companies ADD CONSTRAINT companies_billing_address_object
      CHECK (billing_address IS NULL OR jsonb_typeof(billing_address) = 'object');
  END IF;
END $$;

-- ── STEP 2: the counter ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tax_invoice_counter (
  id           SMALLINT PRIMARY KEY DEFAULT 1,
  last_number  BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT tax_invoice_counter_one_row CHECK (id = 1),
  CONSTRAINT tax_invoice_counter_positive CHECK (last_number >= 0)
);
INSERT INTO public.tax_invoice_counter (id, last_number) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

-- ── STEP 3: invoices ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tax_invoices (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  seq                         BIGINT NOT NULL,
  number                      TEXT NOT NULL,
  doc_type                    TEXT NOT NULL DEFAULT 'receipt',
  status                      TEXT NOT NULL DEFAULT 'paid',
  source                      TEXT NOT NULL DEFAULT 'payment',
  currency                    TEXT NOT NULL DEFAULT 'aud',
  stripe_invoice_id           TEXT,
  stripe_payment_intent_id    TEXT,
  stripe_charge_id            TEXT,
  stripe_checkout_session_id  TEXT,
  stripe_customer_id          TEXT,
  stripe_subscription_id      TEXT,
  issued_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at                     TIMESTAMPTZ,
  subtotal_cents              BIGINT NOT NULL DEFAULT 0,
  discount_cents              BIGINT NOT NULL DEFAULT 0,
  total_cents                 BIGINT NOT NULL DEFAULT 0,
  gst_cents                   BIGINT NOT NULL DEFAULT 0,
  amount_paid_cents           BIGINT NOT NULL DEFAULT 0,
  credit_applied_cents        BIGINT NOT NULL DEFAULT 0,
  refunded_cents              BIGINT NOT NULL DEFAULT 0,
  lines                       JSONB NOT NULL DEFAULT '[]'::jsonb,
  supplier                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  customer                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  refunds                     JSONB NOT NULL DEFAULT '[]'::jsonb,
  payment_method              TEXT,
  emailed_at                  TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Columns any hand-made table lacks.
ALTER TABLE public.tax_invoices
  ADD COLUMN IF NOT EXISTS seq                         BIGINT,
  ADD COLUMN IF NOT EXISTS number                      TEXT,
  ADD COLUMN IF NOT EXISTS doc_type                    TEXT NOT NULL DEFAULT 'receipt',
  ADD COLUMN IF NOT EXISTS status                      TEXT NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS source                      TEXT NOT NULL DEFAULT 'payment',
  ADD COLUMN IF NOT EXISTS currency                    TEXT NOT NULL DEFAULT 'aud',
  ADD COLUMN IF NOT EXISTS stripe_invoice_id           TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id    TEXT,
  ADD COLUMN IF NOT EXISTS stripe_charge_id            TEXT,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id  TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id          TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id      TEXT,
  ADD COLUMN IF NOT EXISTS issued_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS paid_at                     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subtotal_cents              BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_cents              BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cents                 BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_cents                   BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid_cents           BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_applied_cents        BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_cents              BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lines                       JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS supplier                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS customer                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS refunds                     JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_method              TEXT,
  ADD COLUMN IF NOT EXISTS emailed_at                  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now();

-- One invoice per Stripe invoice and per payment; numbers never repeat.
CREATE UNIQUE INDEX IF NOT EXISTS tax_invoices_stripe_invoice_key ON public.tax_invoices (stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tax_invoices_payment_intent_key ON public.tax_invoices (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tax_invoices_number_key ON public.tax_invoices (number);
CREATE UNIQUE INDEX IF NOT EXISTS tax_invoices_seq_key ON public.tax_invoices (seq);
CREATE INDEX IF NOT EXISTS tax_invoices_company_idx ON public.tax_invoices (company_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS tax_invoices_customer_idx ON public.tax_invoices (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_invoices_doc_type_check') THEN
    ALTER TABLE public.tax_invoices ADD CONSTRAINT tax_invoices_doc_type_check CHECK (doc_type IN ('tax_invoice', 'receipt'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_invoices_status_check') THEN
    ALTER TABLE public.tax_invoices ADD CONSTRAINT tax_invoices_status_check CHECK (status IN ('paid', 'partially_refunded', 'refunded'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_invoices_stripe_ref_check') THEN
    ALTER TABLE public.tax_invoices ADD CONSTRAINT tax_invoices_stripe_ref_check CHECK (stripe_invoice_id IS NOT NULL OR stripe_payment_intent_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_invoices_amounts_check') THEN
    ALTER TABLE public.tax_invoices ADD CONSTRAINT tax_invoices_amounts_check
      CHECK (total_cents >= 0 AND gst_cents >= 0 AND gst_cents <= total_cents AND refunded_cents >= 0);
  END IF;
  -- "Tax Invoice" only with Colvy's ABN on it.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_invoices_abn_for_tax_invoice') THEN
    ALTER TABLE public.tax_invoices ADD CONSTRAINT tax_invoices_abn_for_tax_invoice
      CHECK (doc_type <> 'tax_invoice' OR COALESCE(supplier ->> 'abn', '') ~ '^[0-9]{11}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_invoices_lines_array') THEN
    ALTER TABLE public.tax_invoices ADD CONSTRAINT tax_invoices_lines_array CHECK (jsonb_typeof(lines) = 'array' AND jsonb_typeof(refunds) = 'array');
  END IF;
END $$;

-- ── STEP 4: issuing ─────────────────────────────────────────────────────────
-- Returns {"ok": true, "created": true|false, "invoice": {...row}} or
-- {"ok": false, "reason": "..."}. The counter row is locked first, so a second
-- caller for the same payment waits, then sees the first one's row (READ
-- COMMITTED takes a fresh snapshot per statement) and returns it. The unique
-- indexes are the backstop: a violation rolls back this call's numbering too.
CREATE OR REPLACE FUNCTION public.issue_tax_invoice(p_company UUID, p_doc JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k_inv TEXT := NULLIF(p_doc ->> 'stripe_invoice_id', '');
  k_pi  TEXT := NULLIF(p_doc ->> 'stripe_payment_intent_id', '');
  n     BIGINT;
  inv   public.tax_invoices;
BEGIN
  IF p_company IS NULL OR p_doc IS NULL OR (k_inv IS NULL AND k_pi IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF COALESCE((p_doc ->> 'total_cents')::BIGINT, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nothing_paid');
  END IF;

  INSERT INTO public.tax_invoice_counter (id, last_number) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
  SELECT last_number INTO n FROM public.tax_invoice_counter WHERE id = 1 FOR UPDATE;

  SELECT * INTO inv FROM public.tax_invoices
   WHERE (k_inv IS NOT NULL AND stripe_invoice_id = k_inv) OR (k_pi IS NOT NULL AND stripe_payment_intent_id = k_pi)
   ORDER BY seq LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'created', false, 'invoice', to_jsonb(inv));
  END IF;

  BEGIN
    n := n + 1;
    UPDATE public.tax_invoice_counter SET last_number = n WHERE id = 1;
    INSERT INTO public.tax_invoices (
      company_id, seq, number, doc_type, status, source, currency,
      stripe_invoice_id, stripe_payment_intent_id, stripe_charge_id, stripe_checkout_session_id,
      stripe_customer_id, stripe_subscription_id, issued_at, paid_at,
      subtotal_cents, discount_cents, total_cents, gst_cents, amount_paid_cents, credit_applied_cents, refunded_cents,
      lines, supplier, customer, refunds, payment_method)
    VALUES (
      p_company, n, 'CLV-' || lpad(n::TEXT, 6, '0'),
      CASE WHEN p_doc ->> 'doc_type' = 'tax_invoice' THEN 'tax_invoice' ELSE 'receipt' END,
      COALESCE(NULLIF(p_doc ->> 'status', ''), 'paid'),
      COALESCE(NULLIF(p_doc ->> 'source', ''), 'payment'),
      lower(COALESCE(NULLIF(p_doc ->> 'currency', ''), 'aud')),
      k_inv, k_pi,
      NULLIF(p_doc ->> 'stripe_charge_id', ''), NULLIF(p_doc ->> 'stripe_checkout_session_id', ''),
      NULLIF(p_doc ->> 'stripe_customer_id', ''), NULLIF(p_doc ->> 'stripe_subscription_id', ''),
      COALESCE((p_doc ->> 'issued_at')::TIMESTAMPTZ, now()), (p_doc ->> 'paid_at')::TIMESTAMPTZ,
      COALESCE((p_doc ->> 'subtotal_cents')::BIGINT, 0), COALESCE((p_doc ->> 'discount_cents')::BIGINT, 0),
      COALESCE((p_doc ->> 'total_cents')::BIGINT, 0), COALESCE((p_doc ->> 'gst_cents')::BIGINT, 0),
      COALESCE((p_doc ->> 'amount_paid_cents')::BIGINT, 0), COALESCE((p_doc ->> 'credit_applied_cents')::BIGINT, 0),
      COALESCE((p_doc ->> 'refunded_cents')::BIGINT, 0),
      COALESCE(p_doc -> 'lines', '[]'::jsonb), COALESCE(p_doc -> 'supplier', '{}'::jsonb),
      COALESCE(p_doc -> 'customer', '{}'::jsonb), COALESCE(p_doc -> 'refunds', '[]'::jsonb),
      NULLIF(p_doc ->> 'payment_method', ''))
    RETURNING * INTO inv;
    RETURN jsonb_build_object('ok', true, 'created', true, 'invoice', to_jsonb(inv));
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO inv FROM public.tax_invoices
     WHERE (k_inv IS NOT NULL AND stripe_invoice_id = k_inv) OR (k_pi IS NOT NULL AND stripe_payment_intent_id = k_pi)
     ORDER BY seq LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'created', false, 'invoice', to_jsonb(inv));
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END;
END $$;
REVOKE ALL ON FUNCTION public.issue_tax_invoice(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_tax_invoice(UUID, JSONB) TO service_role;

-- ── STEP 5: access ──────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  t TEXT;
  member_ok BOOLEAN := to_regprocedure('public.is_company_member(uuid)') IS NOT NULL
    AND pg_get_functiondef(to_regprocedure('public.is_company_member(uuid)')) ILIKE '%''viewer''%';
BEGIN
  FOREACH t IN ARRAY ARRAY['tax_invoices', 'tax_invoice_counter'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
  IF member_ok THEN
    CREATE POLICY tax_invoices_member_read ON public.tax_invoices
      FOR SELECT TO authenticated USING (is_company_member(company_id) OR is_platform_admin());
    GRANT SELECT ON public.tax_invoices TO authenticated;
  ELSE
    RAISE NOTICE 'is_company_member() is missing or still counts board visitors: tax_invoices is server only. Run COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql, then this file again.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 6: check ───────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('tax_invoices', 'tax_invoice_counter')
 ORDER BY tablename;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Billing history goes back to Stripe's own documents only (the code keeps
-- working without these: documents are built live from Stripe, unnumbered).
-- Dropping the table loses the issued numbers and the frozen details, which
-- you may need to keep for tax records (five years), so export it first.
--
--   DROP FUNCTION IF EXISTS public.issue_tax_invoice(UUID, JSONB);
--   DROP TABLE IF EXISTS public.tax_invoices;
--   DROP TABLE IF EXISTS public.tax_invoice_counter;
--   ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_billing_abn_check;
--   ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_billing_address_object;
--   ALTER TABLE public.companies DROP COLUMN IF EXISTS billing_legal_name, DROP COLUMN IF EXISTS billing_abn, DROP COLUMN IF EXISTS billing_email, DROP COLUMN IF EXISTS billing_address;
--   NOTIFY pgrst, 'reload schema';
