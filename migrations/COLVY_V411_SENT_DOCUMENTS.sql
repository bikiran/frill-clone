-- ============================================================
-- COLVY V411 — RECEIPTS, INVOICES AND QUOTES TEXTED FROM PREXTY POS
--
-- Prexty gets an "SMS" button next to "Email". A tap calls Colvy
-- (POST /api/prexty/documents/send) with the document's number, the outlet,
-- the customer and the address of its PDF in Prexty. Colvy texts the customer
-- from that shop's number (or the main number), with a tracked short link to a
-- branded page (/d/<token>) that shows the document and fetches the PDF from
-- Prexty each time it's opened. Colvy keeps no copy of the PDF.
--
-- Creates:
--   sent_documents        one row per document texted to a customer
--     company_id            the business
--     source                'prexty'
--     doc_type              receipt | invoice | quote | layby | order | credit_note
--     doc_number            R49971, INV-1022 …
--     source_id             Prexty's own id for the document (optional)
--     pdf_url               where Colvy fetches the PDF (must be on the
--                           business's Prexty address; sent with its API key)
--     outlet, location_id   the Prexty outlet and the Colvy location it maps to
--     contact_id, conversation_id   the customer and their thread
--     customer_name, phone  who it went to
--     total, currency, doc_date
--     token                 the unguessable part of /d/<token>   UNIQUE
--     idempotency_key       Prexty's id for the tap, so a double tap sends one
--                           text            UNIQUE per business
--     status, error         sent | failed (+ why)
--     provider_message_id, from_number, sent_at
--     view_count, first_viewed_at, last_viewed_at, download_count
--     expires_at            the link stops working after this (default 1 year)
--
-- Access (V375 / V406 style):
--   • SELECT — staff of the company (is_company_member) and the platform admin.
--   • INSERT / UPDATE / DELETE — the server only (service role).
--   If is_company_member() is missing, or is still V209's first version, the
--   table is created SERVER ONLY and a notice says so. Run V337 and then this
--   file again to add the read policy.
--
-- Safe to run twice. Until it runs, the send endpoint answers 503 with
-- "run migration COLVY_V411".
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.companies') IS NULL THEN
    RAISE EXCEPTION 'public.companies does not exist';
  END IF;
END $$;

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

CREATE TABLE IF NOT EXISTS public.sent_documents (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source               TEXT NOT NULL DEFAULT 'prexty',
  doc_type             TEXT NOT NULL DEFAULT 'receipt',
  doc_number           TEXT,
  source_id            TEXT,
  pdf_url              TEXT,
  outlet               TEXT,
  location_id          UUID,
  contact_id           UUID,
  conversation_id      UUID,
  customer_name        TEXT,
  phone                TEXT,
  total                NUMERIC(12,2),
  currency             TEXT NOT NULL DEFAULT 'AUD',
  doc_date             TIMESTAMPTZ,
  token                TEXT NOT NULL,
  idempotency_key      TEXT,
  status               TEXT NOT NULL DEFAULT 'sending',
  error                TEXT,
  provider_message_id  TEXT,
  from_number          TEXT,
  sent_at              TIMESTAMPTZ,
  view_count           INTEGER NOT NULL DEFAULT 0,
  first_viewed_at      TIMESTAMPTZ,
  last_viewed_at       TIMESTAMPTZ,
  download_count       INTEGER NOT NULL DEFAULT 0,
  expires_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sent_documents_token_key ON public.sent_documents(token);
CREATE UNIQUE INDEX IF NOT EXISTS sent_documents_idem_key
  ON public.sent_documents(company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS sent_documents_company_created ON public.sent_documents(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sent_documents_conversation ON public.sent_documents(conversation_id);

-- ── access ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  member_ok BOOLEAN := to_regprocedure('public.is_company_member(uuid)') IS NOT NULL
    AND pg_get_functiondef(to_regprocedure('public.is_company_member(uuid)')) ILIKE '%''viewer''%';
BEGIN
  ALTER TABLE public.sent_documents ENABLE ROW LEVEL SECURITY;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sent_documents' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.sent_documents', r.policyname);
  END LOOP;
  REVOKE ALL ON public.sent_documents FROM anon, authenticated;
  GRANT ALL ON public.sent_documents TO service_role;
  IF member_ok THEN
    CREATE POLICY sent_documents_member_read ON public.sent_documents
      FOR SELECT TO authenticated USING (is_company_member(company_id) OR is_platform_admin());
    GRANT SELECT ON public.sent_documents TO authenticated;
  ELSE
    RAISE NOTICE 'is_company_member() is missing or still counts board visitors: sent_documents is server only. Run COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql, then this file again.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── check ───────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'sent_documents';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Texted links stop working (/d/<token> shows "not found"); the texts and the
-- inbox thread are untouched.
--
--   DROP TABLE IF EXISTS public.sent_documents;
