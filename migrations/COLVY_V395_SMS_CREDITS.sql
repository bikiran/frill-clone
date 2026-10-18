-- ============================================================
-- COLVY V395 — PREPAID SMS CREDITS (WALLET + LEDGER)
--
-- Colvy pays the carrier for every text through one master account and, until
-- now, charged nothing beyond the plan. From here a business pays for texts
-- beyond its plan's monthly allowance with prepaid credit: it tops up by card
-- (Stripe Checkout), can turn on auto top-up, and texts beyond the allowance
-- need enough credit. No bill shock, no unpaid usage.
--
-- Creates:
--   sms_credit_accounts   one row per company: the balance and the auto top-up
--                         settings and saved card (Stripe ids only, plus brand
--                         and last 4 for display; card data stays with Stripe).
--   sms_credit_ledger     every money movement, signed, with the balance after
--                         it. kind: topup | auto_topup | spend | refund |
--                         adjustment | reserve | release. A Stripe payment
--                         intent or checkout session can be credited only once
--                         (unique where not null).
--   sms_credit_holds      one row per campaign: the credit held for it at
--                         schedule time, the allowance it was quoted as free,
--                         and whether it was settled or released.
--
-- Atomic functions (SECURITY DEFINER, service role only). Each locks the
-- company's account row (FOR UPDATE), so concurrent calls queue up instead of
-- both spending the same money:
--   sms_credit_apply(company, delta, kind, campaign, payment_intent, session,
--                    note, created_by, parts)
--       topup / auto_topup / spend / refund / adjustment. Never lets the
--       balance go below zero (answers ok:false, reason 'insufficient').
--       Answers already:true, crediting nothing, for a payment intent or
--       checkout session already in the ledger.
--   sms_credit_reserve(company, campaign, amount, free_parts, parts,
--                      price_per_part, period, used_at_reserve, created_by)
--       sets the campaign's hold to exactly `amount` (holds more, or gives
--       back the difference). Refuses when the balance can't cover it.
--   sms_credit_release(company, campaign, note)
--       gives the whole hold back (campaign cancelled or failed to start).
--   sms_credit_settle(company, campaign, actual, parts, created_by)
--       at the end of a send: gives the hold back and spends the actual cost
--       (never more than the balance; any shortfall is reported). Once per
--       campaign; a second call answers already:true.
--   Every function answers jsonb: { ok, balance_cents, ... , reason? }.
--
-- Access (V375 / V382 style):
--   • SELECT — staff of the company (is_company_member, which leaves out board
--     visitors and removed members) and the platform admin.
--   • INSERT / UPDATE / DELETE — the server only (service role). No policy and
--     no table privilege for anon or authenticated. The balance only changes
--     through the functions above, which anon and authenticated can't execute.
--   If is_company_member() is missing, or is still V209's first version, the
--   tables are created SERVER ONLY (no read policy) and a notice says so. The
--   Billing page reads through /api/sms-credits with the service role either
--   way. Run V337 and then this file again to add the member read policies.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- Any time, before or after the code from branch claude/sms-credits is
-- deployed. Until it runs, Billing shows "SMS credits aren't set up yet", the
-- top-up and settings routes answer that too, and sending is unaffected (the
-- wallet isn't wired into sending yet; when it is, a missing wallet falls back
-- to today's allowance-only rules).
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. The last queries list the policies (three *_member_read SELECT policies)
--      and the function grants (service_role only).
--   2. Billing → SMS credits shows a A$0.00 balance. Top up A$50 with a Stripe
--      test card; the balance shows A$50.00 and the ledger a Top-up row.
--   3. Signed in as staff (anon key + their token):
--        select * from sms_credit_ledger;                   → their rows only
--        update sms_credit_accounts set balance_cents = 1;  → permission denied
--        select sms_credit_apply(...);                      → permission denied
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

-- The platform admin check (same body as V351 / V364 / V375).
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

-- ── STEP 1: tables ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_credit_accounts (
  company_id                  UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  balance_cents               BIGINT NOT NULL DEFAULT 0,
  currency                    TEXT NOT NULL DEFAULT 'aud',
  auto_topup_enabled          BOOLEAN NOT NULL DEFAULT false,
  auto_topup_threshold_cents  INTEGER NOT NULL DEFAULT 1000,
  auto_topup_amount_cents     INTEGER NOT NULL DEFAULT 5000,
  stripe_customer_id          TEXT,
  stripe_payment_method_id    TEXT,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Columns beyond the core set (and any a hand-made table lacks).
ALTER TABLE public.sms_credit_accounts
  ADD COLUMN IF NOT EXISTS balance_cents               BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency                    TEXT NOT NULL DEFAULT 'aud',
  ADD COLUMN IF NOT EXISTS auto_topup_enabled          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_topup_threshold_cents  INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS auto_topup_amount_cents     INTEGER NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS stripe_customer_id          TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id    TEXT,
  ADD COLUMN IF NOT EXISTS card_brand                  TEXT,
  ADD COLUMN IF NOT EXISTS card_last4                  TEXT,
  ADD COLUMN IF NOT EXISTS auto_topup_failures         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_topup_last_error       TEXT,
  ADD COLUMN IF NOT EXISTS auto_topup_last_attempt_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_topup_pending_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sms_credit_accounts_balance_nonneg') THEN
    ALTER TABLE public.sms_credit_accounts ADD CONSTRAINT sms_credit_accounts_balance_nonneg CHECK (balance_cents >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sms_credit_ledger (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind                      TEXT NOT NULL,
  amount_cents              BIGINT NOT NULL,
  balance_after_cents       BIGINT NOT NULL,
  -- No foreign key: a ledger row outlives a deleted campaign.
  campaign_id               UUID,
  stripe_payment_intent_id  TEXT,
  checkout_session_id       TEXT,
  note                      TEXT,
  created_by                UUID,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_credit_ledger
  ADD COLUMN IF NOT EXISTS campaign_id               UUID,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id  TEXT,
  ADD COLUMN IF NOT EXISTS checkout_session_id       TEXT,
  ADD COLUMN IF NOT EXISTS note                      TEXT,
  ADD COLUMN IF NOT EXISTS created_by                UUID,
  -- SMS parts a spend paid for (for the platform's margin view).
  ADD COLUMN IF NOT EXISTS parts                     INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sms_credit_ledger_kind_check') THEN
    ALTER TABLE public.sms_credit_ledger ADD CONSTRAINT sms_credit_ledger_kind_check
      CHECK (kind IN ('topup', 'auto_topup', 'spend', 'refund', 'adjustment', 'reserve', 'release'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sms_credit_ledger_company_idx ON public.sms_credit_ledger (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_credit_ledger_campaign_idx ON public.sms_credit_ledger (campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sms_credit_ledger_created_idx ON public.sms_credit_ledger (created_at DESC);
-- Idempotency: one credit per Stripe payment, whichever path records it first.
CREATE UNIQUE INDEX IF NOT EXISTS sms_credit_ledger_payment_intent_uq
  ON public.sms_credit_ledger (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sms_credit_ledger_checkout_session_uq
  ON public.sms_credit_ledger (checkout_session_id) WHERE checkout_session_id IS NOT NULL;
-- One settlement spend per campaign.
CREATE UNIQUE INDEX IF NOT EXISTS sms_credit_ledger_campaign_spend_uq
  ON public.sms_credit_ledger (campaign_id) WHERE kind = 'spend' AND campaign_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sms_credit_holds (
  campaign_id      UUID PRIMARY KEY,
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  held_cents       BIGINT NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'held',
  free_parts       INTEGER NOT NULL DEFAULT 0,
  parts            INTEGER NOT NULL DEFAULT 0,
  price_per_part   NUMERIC(10,5),
  period           TEXT,
  used_at_reserve  INTEGER,
  settled_cents    BIGINT,
  shortfall_cents  BIGINT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sms_credit_holds_status_check') THEN
    ALTER TABLE public.sms_credit_holds ADD CONSTRAINT sms_credit_holds_status_check
      CHECK (status IN ('held', 'settled', 'released'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS sms_credit_holds_company_idx ON public.sms_credit_holds (company_id, status);

-- ── STEP 2: access ──────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  r RECORD;
  member_ok BOOLEAN := to_regprocedure('public.is_company_member(uuid)') IS NOT NULL
    AND pg_get_functiondef(to_regprocedure('public.is_company_member(uuid)')) ILIKE '%''viewer''%';
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_credit_accounts', 'sms_credit_ledger', 'sms_credit_holds'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    IF member_ok THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (is_company_member(company_id) OR is_platform_admin())', t || '_member_read', t);
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    END IF;
  END LOOP;
  IF NOT member_ok THEN
    RAISE NOTICE 'is_company_member() is missing or still counts board visitors: the SMS credit tables are server only. Run COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql, then this file again.';
  END IF;
END $$;

-- ── STEP 3: functions ───────────────────────────────────────────────────────

-- The company's account row, created if missing, locked for this transaction.
CREATE OR REPLACE FUNCTION public.sms_credit_lock(p_company UUID)
RETURNS public.sms_credit_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE a public.sms_credit_accounts;
BEGIN
  INSERT INTO public.sms_credit_accounts (company_id) VALUES (p_company) ON CONFLICT (company_id) DO NOTHING;
  SELECT * INTO a FROM public.sms_credit_accounts WHERE company_id = p_company FOR UPDATE;
  RETURN a;
END $$;

CREATE OR REPLACE FUNCTION public.sms_credit_apply(
  p_company UUID,
  p_delta BIGINT,
  p_kind TEXT,
  p_campaign UUID DEFAULT NULL,
  p_payment_intent TEXT DEFAULT NULL,
  p_session TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_parts INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.sms_credit_accounts;
  nb BIGINT;
  lid UUID;
BEGIN
  IF p_company IS NULL OR p_delta IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF p_kind NOT IN ('topup', 'auto_topup', 'spend', 'refund', 'adjustment') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_kind');
  END IF;
  IF (p_kind IN ('topup', 'auto_topup', 'refund') AND p_delta <= 0)
     OR (p_kind = 'spend' AND p_delta > 0)
     OR (p_kind = 'adjustment' AND p_delta = 0) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  a := public.sms_credit_lock(p_company);

  -- A payment already credited (the webhook and the off-session charge can
  -- both report the same one): nothing more to do.
  IF (p_payment_intent IS NOT NULL AND EXISTS (SELECT 1 FROM public.sms_credit_ledger WHERE stripe_payment_intent_id = p_payment_intent))
     OR (p_session IS NOT NULL AND EXISTS (SELECT 1 FROM public.sms_credit_ledger WHERE checkout_session_id = p_session)) THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'balance_cents', a.balance_cents);
  END IF;

  nb := a.balance_cents + p_delta;
  IF nb < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance_cents', a.balance_cents, 'needed_cents', -p_delta);
  END IF;

  UPDATE public.sms_credit_accounts SET balance_cents = nb, updated_at = now() WHERE company_id = p_company;
  INSERT INTO public.sms_credit_ledger (company_id, kind, amount_cents, balance_after_cents, campaign_id,
                                        stripe_payment_intent_id, checkout_session_id, note, created_by, parts)
  VALUES (p_company, p_kind, p_delta, nb, p_campaign, p_payment_intent, p_session, p_note, p_created_by, p_parts)
  RETURNING id INTO lid;
  RETURN jsonb_build_object('ok', true, 'already', false, 'balance_cents', nb, 'ledger_id', lid);
EXCEPTION WHEN unique_violation THEN
  -- Raced past the check above on another path: the payment is recorded once.
  RETURN jsonb_build_object('ok', true, 'already', true,
    'balance_cents', (SELECT balance_cents FROM public.sms_credit_accounts WHERE company_id = p_company));
END $$;

CREATE OR REPLACE FUNCTION public.sms_credit_reserve(
  p_company UUID,
  p_campaign UUID,
  p_amount BIGINT,
  p_free_parts INTEGER DEFAULT 0,
  p_parts INTEGER DEFAULT 0,
  p_price_per_part NUMERIC DEFAULT NULL,
  p_period TEXT DEFAULT NULL,
  p_used_at_reserve INTEGER DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.sms_credit_accounts;
  h public.sms_credit_holds;
  held BIGINT := 0;
  diff BIGINT;
  nb BIGINT;
BEGIN
  IF p_company IS NULL OR p_campaign IS NULL OR p_amount IS NULL OR p_amount < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  a := public.sms_credit_lock(p_company);
  SELECT * INTO h FROM public.sms_credit_holds WHERE campaign_id = p_campaign FOR UPDATE;
  IF FOUND THEN
    IF h.company_id <> p_company THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;
    IF h.status = 'settled' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'settled', 'balance_cents', a.balance_cents);
    END IF;
    IF h.status = 'held' THEN held := h.held_cents; END IF;
  END IF;

  diff := p_amount - held;
  IF diff > 0 AND a.balance_cents < diff THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance_cents', a.balance_cents,
                              'held_cents', held, 'needed_cents', diff);
  END IF;
  nb := a.balance_cents - diff;
  IF diff <> 0 THEN
    UPDATE public.sms_credit_accounts SET balance_cents = nb, updated_at = now() WHERE company_id = p_company;
    INSERT INTO public.sms_credit_ledger (company_id, kind, amount_cents, balance_after_cents, campaign_id, note, created_by, parts)
    VALUES (p_company, CASE WHEN diff > 0 THEN 'reserve' ELSE 'release' END, -diff, nb, p_campaign,
            CASE WHEN diff > 0 THEN 'Held for a campaign' ELSE 'Hold reduced' END, p_created_by, p_parts);
  END IF;

  INSERT INTO public.sms_credit_holds (campaign_id, company_id, held_cents, status, free_parts, parts, price_per_part, period, used_at_reserve)
  VALUES (p_campaign, p_company, p_amount, 'held', COALESCE(p_free_parts, 0), COALESCE(p_parts, 0), p_price_per_part, p_period, p_used_at_reserve)
  ON CONFLICT (campaign_id) DO UPDATE SET
    held_cents = EXCLUDED.held_cents, status = 'held', free_parts = EXCLUDED.free_parts, parts = EXCLUDED.parts,
    price_per_part = EXCLUDED.price_per_part, period = EXCLUDED.period, used_at_reserve = EXCLUDED.used_at_reserve,
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'already', diff = 0, 'balance_cents', nb, 'held_cents', p_amount);
END $$;

CREATE OR REPLACE FUNCTION public.sms_credit_release(
  p_company UUID,
  p_campaign UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.sms_credit_accounts;
  h public.sms_credit_holds;
  nb BIGINT;
BEGIN
  IF p_company IS NULL OR p_campaign IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  a := public.sms_credit_lock(p_company);
  SELECT * INTO h FROM public.sms_credit_holds WHERE campaign_id = p_campaign AND company_id = p_company FOR UPDATE;
  IF NOT FOUND OR h.status <> 'held' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'balance_cents', a.balance_cents, 'released_cents', 0);
  END IF;
  nb := a.balance_cents + h.held_cents;
  IF h.held_cents > 0 THEN
    UPDATE public.sms_credit_accounts SET balance_cents = nb, updated_at = now() WHERE company_id = p_company;
    INSERT INTO public.sms_credit_ledger (company_id, kind, amount_cents, balance_after_cents, campaign_id, note)
    VALUES (p_company, 'release', h.held_cents, nb, p_campaign, COALESCE(p_note, 'Hold returned'));
  END IF;
  UPDATE public.sms_credit_holds SET status = 'released', held_cents = 0, updated_at = now() WHERE campaign_id = p_campaign;
  RETURN jsonb_build_object('ok', true, 'already', false, 'balance_cents', nb, 'released_cents', h.held_cents);
END $$;

CREATE OR REPLACE FUNCTION public.sms_credit_settle(
  p_company UUID,
  p_campaign UUID,
  p_actual BIGINT,
  p_parts INTEGER DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.sms_credit_accounts;
  h public.sms_credit_holds;
  held BIGINT := 0;
  nb BIGINT;
  spend BIGINT;
BEGIN
  IF p_company IS NULL OR p_campaign IS NULL OR p_actual IS NULL OR p_actual < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  a := public.sms_credit_lock(p_company);
  SELECT * INTO h FROM public.sms_credit_holds WHERE campaign_id = p_campaign FOR UPDATE;
  IF FOUND THEN
    IF h.company_id <> p_company THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;
    IF h.status = 'settled' THEN
      RETURN jsonb_build_object('ok', true, 'already', true, 'balance_cents', a.balance_cents,
                                'spent_cents', h.settled_cents, 'shortfall_cents', COALESCE(h.shortfall_cents, 0), 'released_cents', 0);
    END IF;
    IF h.status = 'held' THEN held := h.held_cents; END IF;
  END IF;

  nb := a.balance_cents;
  IF held > 0 THEN
    nb := nb + held;
    INSERT INTO public.sms_credit_ledger (company_id, kind, amount_cents, balance_after_cents, campaign_id, note)
    VALUES (p_company, 'release', held, nb, p_campaign, 'Hold returned at settlement');
  END IF;
  spend := LEAST(p_actual, nb);
  nb := nb - spend;
  -- Always written, even for A$0 (all within the allowance): it marks the
  -- campaign as settled, and the unique index keeps it to one.
  INSERT INTO public.sms_credit_ledger (company_id, kind, amount_cents, balance_after_cents, campaign_id, note, created_by, parts)
  VALUES (p_company, 'spend', -spend, nb, p_campaign, 'Campaign sent', p_created_by, p_parts);
  UPDATE public.sms_credit_accounts SET balance_cents = nb, updated_at = now() WHERE company_id = p_company;

  INSERT INTO public.sms_credit_holds (campaign_id, company_id, held_cents, status, parts, settled_cents, shortfall_cents)
  VALUES (p_campaign, p_company, 0, 'settled', COALESCE(p_parts, 0), spend, p_actual - spend)
  ON CONFLICT (campaign_id) DO UPDATE SET
    held_cents = 0, status = 'settled', settled_cents = EXCLUDED.settled_cents,
    shortfall_cents = EXCLUDED.shortfall_cents, updated_at = now();

  RETURN jsonb_build_object('ok', true, 'already', false, 'balance_cents', nb, 'spent_cents', spend,
                            'released_cents', held, 'shortfall_cents', p_actual - spend);
END $$;

-- Service role only: no browser can move money.
REVOKE ALL ON FUNCTION public.sms_credit_lock(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sms_credit_apply(UUID, BIGINT, TEXT, UUID, TEXT, TEXT, TEXT, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sms_credit_reserve(UUID, UUID, BIGINT, INTEGER, INTEGER, NUMERIC, TEXT, INTEGER, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sms_credit_release(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sms_credit_settle(UUID, UUID, BIGINT, INTEGER, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_credit_apply(UUID, BIGINT, TEXT, UUID, TEXT, TEXT, TEXT, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.sms_credit_reserve(UUID, UUID, BIGINT, INTEGER, INTEGER, NUMERIC, TEXT, INTEGER, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.sms_credit_release(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sms_credit_settle(UUID, UUID, BIGINT, INTEGER, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ── STEP 4: check ───────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, roles FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('sms_credit_accounts', 'sms_credit_ledger', 'sms_credit_holds')
 ORDER BY 1, 2;
SELECT routine_name, grantee FROM information_schema.routine_privileges
 WHERE routine_schema = 'public' AND routine_name LIKE 'sms_credit_%' AND grantee IN ('anon', 'authenticated', 'service_role')
 ORDER BY 1, 2;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- The balances are customers' prepaid money. Export the ledger first
-- (select * from sms_credit_ledger) and refund or carry over any balance.
--
--   DROP FUNCTION IF EXISTS public.sms_credit_settle(UUID, UUID, BIGINT, INTEGER, UUID);
--   DROP FUNCTION IF EXISTS public.sms_credit_release(UUID, UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.sms_credit_reserve(UUID, UUID, BIGINT, INTEGER, INTEGER, NUMERIC, TEXT, INTEGER, UUID);
--   DROP FUNCTION IF EXISTS public.sms_credit_apply(UUID, BIGINT, TEXT, UUID, TEXT, TEXT, TEXT, UUID, INTEGER);
--   DROP FUNCTION IF EXISTS public.sms_credit_lock(UUID);
--   DROP TABLE IF EXISTS public.sms_credit_holds;
--   DROP TABLE IF EXISTS public.sms_credit_ledger;
--   DROP TABLE IF EXISTS public.sms_credit_accounts;
--   NOTIFY pgrst, 'reload schema';
-- The code shows "SMS credits aren't set up yet" again afterwards.
