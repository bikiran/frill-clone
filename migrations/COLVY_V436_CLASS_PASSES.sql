-- ============================================================
-- COLVY V436 — BOOKINGS: CLASS PACKS AND MEMBERSHIPS
--
-- For gyms, studios and anyone who sells classes in bundles: "10 classes for
-- $150, use within 90 days" (a class pack) or "$39 a week, unlimited classes"
-- (a membership, billed again and again by card on the business's Stripe).
-- A customer who has one books a class on the normal booking page and uses a
-- class from it instead of paying.
--
-- Creates:
--   pass_products          what the business sells (packs and memberships)
--   customer_passes        a pass a customer bought (or was given)
--   pass_uses              each class booked with a pass (and whether the
--                          class was given back when it was cancelled)
--   pass_charges           each payment for a pass (a pack once, a
--                          membership every period), one row per Stripe
--                          invoice or payment, so a renewal counts once
--   bookings.pass_id       the pass a booking was paid with
--   colvy_pass_use(...)    use a class from a pass for a booking, under a
--                          lock: never more classes than the pass holds
--   colvy_pass_return(...) give a cancelled booking's class back
--
-- Access: server only (RLS on, no anon/authenticated grants), like V434.
-- Needs V323 (bookings) first. Safe to re-run. Rollback at the bottom.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pass_products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('pack','membership')),
  name          TEXT NOT NULL,
  description   TEXT,
  price_cents   INT  NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency      TEXT NOT NULL DEFAULT 'aud',
  credits       INT  CHECK (credits IS NULL OR credits BETWEEN 1 AND 1000),  -- a pack's classes; a membership's classes per period (NULL = unlimited)
  valid_days    INT  CHECK (valid_days IS NULL OR valid_days BETWEEN 1 AND 3650), -- a pack: days to use it (NULL = no expiry)
  every_n       INT  CHECK (every_n IS NULL OR every_n BETWEEN 1 AND 12),       -- a membership: billed every N…
  unit          TEXT CHECK (unit IS NULL OR unit IN ('week','month')),          -- …weeks or months
  service_ids   UUID[] NOT NULL DEFAULT '{}',   -- the classes it covers (empty = all)
  sell_online   BOOLEAN NOT NULL DEFAULT true,
  active        BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (kind = 'pack' AND credits IS NOT NULL AND every_n IS NULL OR kind = 'membership' AND every_n IS NOT NULL AND unit IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS pass_products_company_idx ON public.pass_products (company_id, active, sort_order);

CREATE TABLE IF NOT EXISTS public.customer_passes (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id             UUID REFERENCES public.pass_products(id) ON DELETE SET NULL,
  contact_id             UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  customer_name          TEXT,
  customer_email         TEXT,
  customer_phone         TEXT,
  kind                   TEXT NOT NULL CHECK (kind IN ('pack','membership')),
  name                   TEXT NOT NULL,                  -- the product's name when bought
  service_ids            UUID[] NOT NULL DEFAULT '{}',   -- what it covers, as bought (empty = all)
  credits_total          INT,        -- a pack: classes in it (the team can add or take some off); a membership: per period (NULL = unlimited)
  credits_used           INT NOT NULL DEFAULT 0 CHECK (credits_used >= 0),   -- a pack: classes used; a membership: classes booked so far
  price_cents            INT NOT NULL DEFAULT 0,
  currency               TEXT NOT NULL DEFAULT 'aud',
  valid_days             INT,             -- a pack: days to use it, counted from when it's paid for
  every_n                INT,
  unit                   TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','past_due','cancelled','expired')),
  activated_at           TIMESTAMPTZ,
  expires_at             TIMESTAMPTZ,     -- a pack: last moment a class can start
  period_start           TIMESTAMPTZ,     -- a membership: the period paid for
  period_end             TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN NOT NULL DEFAULT false,
  cancelled_at           TIMESTAMPTZ,
  source                 TEXT NOT NULL DEFAULT 'online' CHECK (source IN ('online','team')),
  paid_how               TEXT,            -- 'card' | 'cash' | 'other' | 'free'
  stripe_session_id      TEXT,
  stripe_subscription_id TEXT,
  stripe_customer_id     TEXT,
  chat_payment_id        UUID,
  sold_by                UUID,
  sold_by_name           TEXT,
  note                   TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_passes_company_idx ON public.customer_passes (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_passes_contact_idx ON public.customer_passes (company_id, contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS customer_passes_session_uniq ON public.customer_passes (stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customer_passes_sub_uniq ON public.customer_passes (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pass_uses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pass_id      UUID NOT NULL REFERENCES public.customer_passes(id) ON DELETE CASCADE,
  booking_id   UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  class_at     TIMESTAMPTZ NOT NULL,     -- when the class starts
  used_by      TEXT,                     -- 'customer' | the team member's name
  returned_at  TIMESTAMPTZ,              -- given back (cancelled in time)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pass_uses_pass_idx ON public.pass_uses (pass_id, class_at);
-- A booking uses one class, once (until it's given back).
CREATE UNIQUE INDEX IF NOT EXISTS pass_uses_booking_uniq ON public.pass_uses (booking_id) WHERE booking_id IS NOT NULL AND returned_at IS NULL;

CREATE TABLE IF NOT EXISTS public.pass_charges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pass_id         UUID NOT NULL REFERENCES public.customer_passes(id) ON DELETE CASCADE,
  stripe_ref      TEXT,                  -- the Stripe invoice (membership) or payment intent (pack)
  amount_cents    INT NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'aud',
  paid_how        TEXT NOT NULL DEFAULT 'card',
  period_start    TIMESTAMPTZ,
  period_end      TIMESTAMPTZ,
  chat_payment_id UUID,
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pass_charges_ref_uniq ON public.pass_charges (stripe_ref) WHERE stripe_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS pass_charges_pass_idx ON public.pass_charges (pass_id, paid_at DESC);

ALTER TABLE public.customer_passes ADD COLUMN IF NOT EXISTS valid_days INT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS pass_id UUID REFERENCES public.customer_passes(id) ON DELETE SET NULL;

-- ── Use a class from a pass ──────────────────────────────────────────────────
-- p_from / p_to: a limited membership's billing period that the class falls in
-- (worked out by the app); unused otherwise. Returns { ok, left } or { ok:false, reason }.
CREATE OR REPLACE FUNCTION public.colvy_pass_use(
  p_pass UUID, p_company UUID, p_booking UUID, p_class_at TIMESTAMPTZ,
  p_from TIMESTAMPTZ, p_to TIMESTAMPTZ, p_by TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.customer_passes%ROWTYPE;
  v_used INT;
BEGIN
  SELECT * INTO p FROM public.customer_passes WHERE id = p_pass AND company_id = p_company FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF p_booking IS NOT NULL AND EXISTS (SELECT 1 FROM public.pass_uses WHERE booking_id = p_booking AND returned_at IS NULL) THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF p.status <> 'active' THEN RETURN jsonb_build_object('ok', false, 'reason', p.status); END IF;

  IF p.kind = 'pack' THEN
    IF p.expires_at IS NOT NULL AND p_class_at > p.expires_at THEN RETURN jsonb_build_object('ok', false, 'reason', 'expires_first'); END IF;
    IF p.credits_used >= COALESCE(p.credits_total, 0) THEN RETURN jsonb_build_object('ok', false, 'reason', 'none_left'); END IF;
  ELSE
    IF p.cancel_at_period_end AND p.period_end IS NOT NULL AND p_class_at >= p.period_end THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'ends_first');
    END IF;
    IF p.credits_total IS NOT NULL THEN
      SELECT count(*) INTO v_used FROM public.pass_uses
        WHERE pass_id = p.id AND returned_at IS NULL AND class_at >= p_from AND class_at < p_to;
      IF v_used >= p.credits_total THEN RETURN jsonb_build_object('ok', false, 'reason', 'period_full'); END IF;
    END IF;
  END IF;

  INSERT INTO public.pass_uses (company_id, pass_id, booking_id, class_at, used_by)
    VALUES (p.company_id, p.id, p_booking, p_class_at, p_by);
  UPDATE public.customer_passes SET credits_used = credits_used + 1, updated_at = now() WHERE id = p.id;
  RETURN jsonb_build_object('ok', true,
    'left', CASE WHEN p.kind = 'pack' THEN COALESCE(p.credits_total, 0) - p.credits_used - 1
                 WHEN p.credits_total IS NOT NULL THEN p.credits_total - v_used - 1 ELSE NULL END);
END $$;

-- ── Give a cancelled booking's class back ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.colvy_pass_return(p_booking UUID, p_company UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  u public.pass_uses%ROWTYPE;
BEGIN
  SELECT * INTO u FROM public.pass_uses WHERE booking_id = p_booking AND company_id = p_company AND returned_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_used'); END IF;
  PERFORM 1 FROM public.customer_passes WHERE id = u.pass_id FOR UPDATE;
  UPDATE public.pass_uses SET returned_at = now() WHERE id = u.id AND returned_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_used'); END IF;
  UPDATE public.customer_passes SET credits_used = GREATEST(0, credits_used - 1), updated_at = now() WHERE id = u.pass_id;
  RETURN jsonb_build_object('ok', true, 'pass_id', u.pass_id);
END $$;

-- ── Access: server only ──────────────────────────────────────────────────────
DO $$ DECLARE t TEXT; r RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['pass_products','customer_passes','pass_uses','pass_charges'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.colvy_pass_use(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.colvy_pass_use(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.colvy_pass_return(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.colvy_pass_return(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Verify afterwards (should list four tables):
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
--   AND table_name IN ('pass_products','customer_passes','pass_uses','pass_charges');

-- ── Rollback ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.colvy_pass_return(UUID, UUID);
-- DROP FUNCTION IF EXISTS public.colvy_pass_use(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT);
-- ALTER TABLE public.bookings DROP COLUMN IF EXISTS pass_id;
-- DROP TABLE IF EXISTS public.pass_charges, public.pass_uses, public.customer_passes, public.pass_products;
