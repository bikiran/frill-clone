-- ============================================================
-- COLVY V406 — ADJUSTMENT NOTES (CREDIT NOTES) FOR REFUNDS
--
-- V404 gives every payment to Colvy a tax invoice (CLV-000001 …). When one of
-- those payments is refunded, in full or in part, or reduced by a credit note
-- made in the Stripe dashboard, GST law asks Colvy for an adjustment note: the
-- words "Adjustment Note", Colvy's identity and ABN, the date, the buyer, the
-- original tax invoice's number and date, the amount and the GST adjustment,
-- and why. lib/tax-credit-notes issues them from the Stripe webhook (or when
-- the payment is opened later), numbered CN-000001, CN-000002, … with their
-- own counter, ONE per Stripe refund and ONE per Stripe credit note (a credit
-- note that pays out a refund shares that note with the refund). Frozen when
-- issued, like the invoices. Without COLVY_ABN, or when the original is only a
-- Receipt, the document is a "refund_receipt", never an adjustment note.
--
-- Creates:
--   tax_credit_notes            one row per Stripe refund / Stripe credit note
--     company_id                  the business
--     number, seq                 CN-000012 and 12: sequential across Colvy,
--                                 given out by issue_tax_credit_note only
--     kind                        adjustment_note | refund_receipt
--     status                      issued | void (the refund failed or the
--                                 Stripe credit note was voided; the number
--                                 stays used)
--     tax_invoice_id              the original tax invoice (tax_invoices.id)
--     original_number, original_issued_at, original_doc_type,
--     original_total_cents, original_gst_cents
--                                 the original as it was when this was issued
--     prior_adjusted_cents        what earlier notes had already adjusted on it
--     stripe_refund_id            UNIQUE (re_…)
--     stripe_credit_note_id       UNIQUE (cn_…)
--     stripe_refund_ids           refunds a Stripe credit note paid out
--     stripe_charge_id, stripe_invoice_id, stripe_payment_intent_id
--     currency, amount_cents, gst_cents   (AUD cents, positive = credited)
--     lines                       [{description, quantity, unitCents, amountCents}]
--     reason                      "Refund of SMS credit top-up", …
--     supplier, customer          {name, abn, email, address[]} frozen at issue
--     issued_at, emailed_at, voided_at, created_at, updated_at
--   tax_credit_note_counter     one row: the last number given out
--   issue_tax_credit_note(p_company, p_note)   the only way rows are made:
--                               locks the counter, returns the existing note
--                               when the refund / credit note already has one
--                               (linking a credit note to the refund it paid
--                               out), refuses a note that would take the
--                               adjustments past the invoice's total, keeps the
--                               GST credited within the invoice's GST (the note
--                               that completes the total takes what's left),
--                               otherwise numbers and inserts it.
--                               Service role only.
--
-- Access (V375 / V403 / V404 style):
--   • tax_credit_notes SELECT — staff of the company (is_company_member: owner
--     and team, not board visitors) and the platform admin.
--   • INSERT / UPDATE / DELETE — the server only (service role).
--   • tax_credit_note_counter — server only (no policy at all).
--   If is_company_member() is missing, or is still V209's first version, the
--   table is created SERVER ONLY (no read policy) and a notice says so. Run
--   V337 and then this file again to add the read policy.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- After V404, any time before or after the code from branch
-- claude/credit-notes is deployed. Until it runs: refunds are still recorded
-- on the original invoice ("Adjustment" box, as before); no notes are issued
-- or emailed; billing history and invoices work as before.
-- In Stripe → Developers → Webhooks, the Colvy endpoint should send:
--   charge.refunded, charge.refund.updated, refund.created, refund.updated,
--   refund.failed, credit_note.created, credit_note.updated, credit_note.voided
-- (missed events are caught when the payment is opened, and by super admin's
-- "Issue missing from Stripe").
--
-- To start numbering somewhere other than 1, before the first note:
--   UPDATE tax_credit_note_counter SET last_number = 1000 WHERE id = 1;
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. The last query lists one policy, tax_credit_notes_member_read, SELECT.
--   2. Refund part of a test payment in Stripe: Billing → Billing history shows
--      "Refunded A$X" and an adjustment note CN-000001 under it; the original
--      invoice says "Adjusted by CN-000001 on <date>: −A$X".
--   3. Signed in as staff (anon key + their token):
--        select number from tax_credit_notes;            → their business's rows only
--        insert into tax_credit_notes (company_id) ...;  → permission denied
--        select issue_tax_credit_note(...);              → permission denied
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 0: what this builds on ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.companies') IS NULL THEN
    RAISE EXCEPTION 'public.companies does not exist';
  END IF;
  IF to_regclass('public.tax_invoices') IS NULL THEN
    RAISE EXCEPTION 'public.tax_invoices does not exist: run COLVY_V404_TAX_INVOICES.sql first';
  END IF;
END $$;

-- The platform admin check (same body as V351 / V364 / V375 / V395 / V398 / V399 / V403 / V404).
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

-- ── STEP 1: the counter ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tax_credit_note_counter (
  id           SMALLINT PRIMARY KEY DEFAULT 1,
  last_number  BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT tax_credit_note_counter_one_row CHECK (id = 1),
  CONSTRAINT tax_credit_note_counter_positive CHECK (last_number >= 0)
);
INSERT INTO public.tax_credit_note_counter (id, last_number) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

-- ── STEP 2: notes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tax_credit_notes (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  seq                       BIGINT NOT NULL,
  number                    TEXT NOT NULL,
  kind                      TEXT NOT NULL DEFAULT 'refund_receipt',
  status                    TEXT NOT NULL DEFAULT 'issued',
  tax_invoice_id            UUID NOT NULL REFERENCES public.tax_invoices(id) ON DELETE CASCADE,
  original_number           TEXT,
  original_issued_at        TIMESTAMPTZ,
  original_doc_type         TEXT,
  original_total_cents      BIGINT NOT NULL DEFAULT 0,
  original_gst_cents        BIGINT NOT NULL DEFAULT 0,
  prior_adjusted_cents      BIGINT NOT NULL DEFAULT 0,
  stripe_refund_id          TEXT,
  stripe_credit_note_id     TEXT,
  stripe_refund_ids         TEXT[] NOT NULL DEFAULT '{}',
  stripe_charge_id          TEXT,
  stripe_invoice_id         TEXT,
  stripe_payment_intent_id  TEXT,
  currency                  TEXT NOT NULL DEFAULT 'aud',
  amount_cents              BIGINT NOT NULL DEFAULT 0,
  gst_cents                 BIGINT NOT NULL DEFAULT 0,
  lines                     JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason                    TEXT,
  supplier                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  customer                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  emailed_at                TIMESTAMPTZ,
  voided_at                 TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Columns any hand-made table lacks.
ALTER TABLE public.tax_credit_notes
  ADD COLUMN IF NOT EXISTS seq                       BIGINT,
  ADD COLUMN IF NOT EXISTS number                    TEXT,
  ADD COLUMN IF NOT EXISTS kind                      TEXT NOT NULL DEFAULT 'refund_receipt',
  ADD COLUMN IF NOT EXISTS status                    TEXT NOT NULL DEFAULT 'issued',
  ADD COLUMN IF NOT EXISTS tax_invoice_id            UUID,
  ADD COLUMN IF NOT EXISTS original_number           TEXT,
  ADD COLUMN IF NOT EXISTS original_issued_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_doc_type         TEXT,
  ADD COLUMN IF NOT EXISTS original_total_cents      BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_gst_cents        BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prior_adjusted_cents      BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_refund_id          TEXT,
  ADD COLUMN IF NOT EXISTS stripe_credit_note_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_refund_ids         TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS stripe_charge_id          TEXT,
  ADD COLUMN IF NOT EXISTS stripe_invoice_id         TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id  TEXT,
  ADD COLUMN IF NOT EXISTS currency                  TEXT NOT NULL DEFAULT 'aud',
  ADD COLUMN IF NOT EXISTS amount_cents              BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_cents                 BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lines                     JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reason                    TEXT,
  ADD COLUMN IF NOT EXISTS supplier                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS customer                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS issued_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS emailed_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_at                 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at                TIMESTAMPTZ NOT NULL DEFAULT now();

-- One note per Stripe refund and per Stripe credit note; numbers never repeat.
CREATE UNIQUE INDEX IF NOT EXISTS tax_credit_notes_refund_key ON public.tax_credit_notes (stripe_refund_id) WHERE stripe_refund_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tax_credit_notes_credit_note_key ON public.tax_credit_notes (stripe_credit_note_id) WHERE stripe_credit_note_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tax_credit_notes_number_key ON public.tax_credit_notes (number);
CREATE UNIQUE INDEX IF NOT EXISTS tax_credit_notes_seq_key ON public.tax_credit_notes (seq);
CREATE INDEX IF NOT EXISTS tax_credit_notes_company_idx ON public.tax_credit_notes (company_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS tax_credit_notes_invoice_idx ON public.tax_credit_notes (tax_invoice_id);
CREATE INDEX IF NOT EXISTS tax_credit_notes_refund_ids_idx ON public.tax_credit_notes USING gin (stripe_refund_ids);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_credit_notes_invoice_fkey') THEN
    -- A hand-made table may lack the link to the invoice.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
                    WHERE c.conrelid = 'public.tax_credit_notes'::regclass AND c.contype = 'f' AND a.attname = 'tax_invoice_id') THEN
      ALTER TABLE public.tax_credit_notes ADD CONSTRAINT tax_credit_notes_invoice_fkey
        FOREIGN KEY (tax_invoice_id) REFERENCES public.tax_invoices(id) ON DELETE CASCADE;
    END IF;
  END IF;
  -- Every note adjusts an invoice (a hand-made table's column may allow none).
  IF NOT EXISTS (SELECT 1 FROM public.tax_credit_notes WHERE tax_invoice_id IS NULL) THEN
    ALTER TABLE public.tax_credit_notes ALTER COLUMN tax_invoice_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_credit_notes_kind_check') THEN
    ALTER TABLE public.tax_credit_notes ADD CONSTRAINT tax_credit_notes_kind_check CHECK (kind IN ('adjustment_note', 'refund_receipt'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_credit_notes_status_check') THEN
    ALTER TABLE public.tax_credit_notes ADD CONSTRAINT tax_credit_notes_status_check CHECK (status IN ('issued', 'void'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_credit_notes_stripe_ref_check') THEN
    ALTER TABLE public.tax_credit_notes ADD CONSTRAINT tax_credit_notes_stripe_ref_check CHECK (stripe_refund_id IS NOT NULL OR stripe_credit_note_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_credit_notes_amounts_check') THEN
    ALTER TABLE public.tax_credit_notes ADD CONSTRAINT tax_credit_notes_amounts_check
      CHECK (amount_cents > 0 AND gst_cents >= 0 AND gst_cents <= amount_cents);
  END IF;
  -- "Adjustment Note" only with Colvy's ABN on it (V404's rule for "Tax Invoice").
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_credit_notes_abn_for_adjustment_note') THEN
    ALTER TABLE public.tax_credit_notes ADD CONSTRAINT tax_credit_notes_abn_for_adjustment_note
      CHECK (kind <> 'adjustment_note' OR COALESCE(supplier ->> 'abn', '') ~ '^[0-9]{11}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_credit_notes_lines_array') THEN
    ALTER TABLE public.tax_credit_notes ADD CONSTRAINT tax_credit_notes_lines_array CHECK (jsonb_typeof(lines) = 'array');
  END IF;
END $$;

-- ── STEP 3: issuing ─────────────────────────────────────────────────────────
-- Returns {"ok": true, "created": true|false, "note": {...row}} or
-- {"ok": false, "reason": "..."}: invalid, nothing_refunded, no_invoice,
-- other_company, exceeds_invoice, conflict. The counter row is locked first,
-- so callers for the same refund (or for two refunds of one invoice) take
-- turns: the second sees the first one's row and the first one's total.
-- A refused call never uses a number.
CREATE OR REPLACE FUNCTION public.issue_tax_credit_note(p_company UUID, p_note JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k_re    TEXT := NULLIF(p_note ->> 'stripe_refund_id', '');
  k_cn    TEXT := NULLIF(p_note ->> 'stripe_credit_note_id', '');
  k_ids   TEXT[];
  inv_id  UUID;
  amt     BIGINT := COALESCE(NULLIF(p_note ->> 'amount_cents', '')::BIGINT, 0);
  gst     BIGINT := GREATEST(COALESCE(NULLIF(p_note ->> 'gst_cents', '')::BIGINT, 0), 0);
  prior_a BIGINT;
  prior_g BIGINT;
  n       BIGINT;
  inv     public.tax_invoices;
  note    public.tax_credit_notes;
  v_kind  TEXT;
BEGIN
  BEGIN
    inv_id := NULLIF(p_note ->> 'tax_invoice_id', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    inv_id := NULL;
  END;
  SELECT COALESCE(array_agg(DISTINCT x) FILTER (WHERE x IS NOT NULL AND x <> ''), '{}')
    INTO k_ids
    FROM (SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_note -> 'stripe_refund_ids') = 'array' THEN p_note -> 'stripe_refund_ids' ELSE '[]'::jsonb END) AS x
          UNION SELECT k_re) s;
  IF p_company IS NULL OR p_note IS NULL OR (k_re IS NULL AND k_cn IS NULL) OR inv_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF amt <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nothing_refunded');
  END IF;

  INSERT INTO public.tax_credit_note_counter (id, last_number) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
  SELECT last_number INTO n FROM public.tax_credit_note_counter WHERE id = 1 FOR UPDATE;

  -- Already issued for this credit note, or for one of its refunds.
  SELECT * INTO note FROM public.tax_credit_notes
   WHERE (k_cn IS NOT NULL AND stripe_credit_note_id = k_cn)
      OR stripe_refund_id = ANY (k_ids)
      OR stripe_refund_ids && k_ids
   ORDER BY seq LIMIT 1;
  IF FOUND THEN
    -- A refund's note, now known to be paid out by this credit note: link them.
    IF k_cn IS NOT NULL AND note.stripe_credit_note_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.tax_credit_notes WHERE stripe_credit_note_id = k_cn) THEN
      UPDATE public.tax_credit_notes
         SET stripe_credit_note_id = k_cn,
             stripe_refund_ids = ARRAY(SELECT DISTINCT u FROM unnest(note.stripe_refund_ids || k_ids) u),
             updated_at = now()
       WHERE id = note.id
      RETURNING * INTO note;
    END IF;
    RETURN jsonb_build_object('ok', true, 'created', false, 'note', to_jsonb(note));
  END IF;

  SELECT * INTO inv FROM public.tax_invoices WHERE id = inv_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_invoice');
  END IF;
  IF inv.company_id <> p_company THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'other_company');
  END IF;

  -- Never more than the invoice's total, and never more GST than it had.
  SELECT COALESCE(sum(amount_cents), 0), COALESCE(sum(gst_cents), 0) INTO prior_a, prior_g
    FROM public.tax_credit_notes WHERE tax_invoice_id = inv_id AND status <> 'void';
  IF prior_a + amt > inv.total_cents THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'exceeds_invoice', 'left_cents', GREATEST(inv.total_cents - prior_a, 0));
  END IF;
  IF prior_a + amt = inv.total_cents THEN
    gst := GREATEST(inv.gst_cents - prior_g, 0);
  END IF;
  gst := LEAST(gst, GREATEST(inv.gst_cents - prior_g, 0), amt);

  -- An adjustment note adjusts a tax invoice; otherwise it's a refund receipt.
  v_kind := CASE WHEN p_note ->> 'kind' = 'adjustment_note' AND inv.doc_type = 'tax_invoice' THEN 'adjustment_note' ELSE 'refund_receipt' END;

  BEGIN
    n := n + 1;
    UPDATE public.tax_credit_note_counter SET last_number = n WHERE id = 1;
    INSERT INTO public.tax_credit_notes (
      company_id, seq, number, kind, status, tax_invoice_id,
      original_number, original_issued_at, original_doc_type, original_total_cents, original_gst_cents, prior_adjusted_cents,
      stripe_refund_id, stripe_credit_note_id, stripe_refund_ids,
      stripe_charge_id, stripe_invoice_id, stripe_payment_intent_id,
      currency, amount_cents, gst_cents, lines, reason, supplier, customer, issued_at)
    VALUES (
      p_company, n, 'CN-' || lpad(n::TEXT, 6, '0'), v_kind, 'issued', inv.id,
      inv.number, inv.issued_at, inv.doc_type, inv.total_cents, inv.gst_cents, prior_a,
      k_re, k_cn, k_ids,
      COALESCE(NULLIF(p_note ->> 'stripe_charge_id', ''), inv.stripe_charge_id),
      COALESCE(NULLIF(p_note ->> 'stripe_invoice_id', ''), inv.stripe_invoice_id),
      COALESCE(NULLIF(p_note ->> 'stripe_payment_intent_id', ''), inv.stripe_payment_intent_id),
      lower(COALESCE(NULLIF(p_note ->> 'currency', ''), inv.currency, 'aud')), amt, gst,
      CASE WHEN jsonb_typeof(p_note -> 'lines') = 'array' THEN p_note -> 'lines' ELSE '[]'::jsonb END,
      NULLIF(left(p_note ->> 'reason', 300), ''),
      COALESCE(p_note -> 'supplier', '{}'::jsonb), COALESCE(p_note -> 'customer', inv.customer, '{}'::jsonb),
      COALESCE(NULLIF(p_note ->> 'issued_at', '')::TIMESTAMPTZ, now()))
    RETURNING * INTO note;
    RETURN jsonb_build_object('ok', true, 'created', true, 'note', to_jsonb(note));
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO note FROM public.tax_credit_notes
     WHERE (k_cn IS NOT NULL AND stripe_credit_note_id = k_cn) OR stripe_refund_id = ANY (k_ids) OR stripe_refund_ids && k_ids
     ORDER BY seq LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'created', false, 'note', to_jsonb(note));
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END;
END $$;
REVOKE ALL ON FUNCTION public.issue_tax_credit_note(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_tax_credit_note(UUID, JSONB) TO service_role;

-- ── STEP 4: access ──────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  t TEXT;
  member_ok BOOLEAN := to_regprocedure('public.is_company_member(uuid)') IS NOT NULL
    AND pg_get_functiondef(to_regprocedure('public.is_company_member(uuid)')) ILIKE '%''viewer''%';
BEGIN
  FOREACH t IN ARRAY ARRAY['tax_credit_notes', 'tax_credit_note_counter'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
  IF member_ok THEN
    CREATE POLICY tax_credit_notes_member_read ON public.tax_credit_notes
      FOR SELECT TO authenticated USING (is_company_member(company_id) OR is_platform_admin());
    GRANT SELECT ON public.tax_credit_notes TO authenticated;
  ELSE
    RAISE NOTICE 'is_company_member() is missing or still counts board visitors: tax_credit_notes is server only. Run COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql, then this file again.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 5: check ───────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('tax_credit_notes', 'tax_credit_note_counter')
 ORDER BY tablename;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Refunds go back to being only an "Adjustment" box on the original invoice
-- (the code keeps working without these). Dropping the table loses the issued
-- note numbers and their frozen details, which you may need to keep for tax
-- records (five years), so export it first. Run this before V404's rollback
-- (the notes point at tax_invoices).
--
--   DROP FUNCTION IF EXISTS public.issue_tax_credit_note(UUID, JSONB);
--   DROP TABLE IF EXISTS public.tax_credit_notes;
--   DROP TABLE IF EXISTS public.tax_credit_note_counter;
--   NOTIFY pgrst, 'reload schema';
