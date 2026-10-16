-- ============================================================
-- COLVY V380 — LINK FORM PAYMENTS TO THEIR FORM AND QUESTION
--
-- A form's payment question writes a chat_payments row (POST
-- /api/forms/payment), but nothing on that row said which form or question it
-- was for. Results had to guess from the description and amount, so a payment
-- made on one form could be pasted into a response on another form of the same
-- business (same price) and show as "Paid" there, and renaming a payment
-- question and changing its price made older real payments look unverified.
--
-- This adds two nullable columns that /api/forms/payment fills in for every new
-- form payment:
--
--   chat_payments.form_id      uuid  the form the payment was taken on
--   chat_payments.question_id  text  the payment question's id (question ids
--                                    aren't always uuids, so text)
--
-- and an index on form_id. Nothing else changes: no policy, grant or existing
-- row is touched. Rows from before this (and every non-form payment) keep NULL,
-- and Results keep the old description/amount check for those rows only.
-- No foreign key on purpose: a payment is a money record and must outlive the
-- form it came from.
--
-- ── BEFORE RUNNING ──────────────────────────────────────────────────────────
-- Nothing. The code works before and after: until this runs, /api/forms/payment
-- retries its insert without the two columns, and Results fall back to the old
-- check. Independent of V375 / V376; any order.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. SELECT column_name, data_type FROM information_schema.columns
--       WHERE table_name = 'chat_payments' AND column_name IN ('form_id', 'question_id');
--        → form_id uuid, question_id text
--   2. Pay on a test form with a payment question, then:
--        SELECT form_id, question_id FROM chat_payments ORDER BY created_at DESC LIMIT 1;
--        → that form's id and the payment question's id
--
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   DROP INDEX IF EXISTS public.idx_chat_payments_form;
--   ALTER TABLE public.chat_payments DROP COLUMN IF EXISTS question_id;
--   ALTER TABLE public.chat_payments DROP COLUMN IF EXISTS form_id;
--   (Results then fall back to the description/amount check for every row.)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_payments') THEN
    RAISE NOTICE 'chat_payments does not exist — skipped';
    RETURN;
  END IF;

  ALTER TABLE public.chat_payments ADD COLUMN IF NOT EXISTS form_id uuid;
  ALTER TABLE public.chat_payments ADD COLUMN IF NOT EXISTS question_id text;

  CREATE INDEX IF NOT EXISTS idx_chat_payments_form
    ON public.chat_payments (form_id) WHERE form_id IS NOT NULL;
END $$;

NOTIFY pgrst, 'reload schema';
