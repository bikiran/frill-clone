-- COLVY V323 — Online booking & appointments (Phase 1)
--
-- • booking_services  — what customers can book (duration, buffers, price,
--                       deposit, staff, notice, questions…)
-- • bookings          — every booking made from the public page / a link,
--                       with its hold, payment and self-serve manage token
-- • companies.booking_settings — opening hours, staff hours, closed dates,
--                       cancellation policy, page text, notifications
-- • claim_booking_slot() — atomic "is this slot still free? then take it",
--                       so two customers can never grab the same time
-- • calendar_events RLS tightened to company members (it holds customer
--   names, phones and addresses; it was readable by anyone with the anon key)
--
-- Idempotent — safe to run more than once.

-- ── Services ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking_services (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  kind            TEXT NOT NULL DEFAULT 'appointment',   -- appointment | booking
  duration_mins   INT  NOT NULL DEFAULT 30,
  buffer_before   INT  NOT NULL DEFAULT 0,
  buffer_after    INT  NOT NULL DEFAULT 0,
  slot_interval   INT,                                   -- null = every 15 min
  capacity        INT  NOT NULL DEFAULT 1,               -- >1 = group / class
  price_cents     INT  NOT NULL DEFAULT 0,
  payment_mode    TEXT NOT NULL DEFAULT 'none',          -- none | deposit | full
  deposit_cents   INT  NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'aud',
  location_mode   TEXT NOT NULL DEFAULT 'outlet',        -- outlet | customer | phone | video
  location_ids    UUID[] DEFAULT '{}',
  video_url       TEXT,
  staff_ids       UUID[] DEFAULT '{}',                   -- empty = every bookable staff member
  min_notice_mins INT  NOT NULL DEFAULT 120,
  max_days_ahead  INT  NOT NULL DEFAULT 60,
  questions       JSONB NOT NULL DEFAULT '[]'::jsonb,
  color           TEXT,
  image_url       TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS booking_services_slug_idx ON booking_services (company_id, slug);
CREATE INDEX IF NOT EXISTS booking_services_company_idx ON booking_services (company_id, active, sort_order);

-- ── Bookings ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  service_id            UUID REFERENCES booking_services(id) ON DELETE SET NULL,
  service_name          TEXT,
  staff_id              UUID,                 -- null = the business (no staff picked)
  staff_name            TEXT,
  staff_choice          TEXT NOT NULL DEFAULT 'any',   -- any | specific
  location_id           UUID,
  location_label        TEXT,
  address               TEXT,
  starts_at             TIMESTAMPTZ NOT NULL,
  ends_at               TIMESTAMPTZ NOT NULL,
  busy_from             TIMESTAMPTZ NOT NULL, -- starts_at - buffer_before
  busy_until            TIMESTAMPTZ NOT NULL, -- ends_at + buffer_after
  timezone              TEXT,
  status                TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | cancelled | expired | completed | no_show
  hold_expires_at       TIMESTAMPTZ,
  seats                 INT NOT NULL DEFAULT 1,
  customer_name         TEXT,
  customer_email        TEXT,
  customer_phone        TEXT,
  customer_timezone     TEXT,
  answers               JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes                 TEXT,
  contact_id            UUID,
  conversation_id       UUID,
  calendar_event_id     UUID,
  price_cents           INT NOT NULL DEFAULT 0,
  amount_due_cents      INT NOT NULL DEFAULT 0,  -- charged online at booking
  currency              TEXT NOT NULL DEFAULT 'aud',
  payment_mode          TEXT NOT NULL DEFAULT 'none',
  payment_status        TEXT NOT NULL DEFAULT 'none', -- none | pending | paid | refunded | partially_refunded
  chat_payment_id       UUID,
  stripe_session_id     TEXT,
  stripe_payment_intent TEXT,
  refunded_cents        INT NOT NULL DEFAULT 0,
  manage_token          TEXT NOT NULL,
  source                TEXT NOT NULL DEFAULT 'page',
  confirmed_at          TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  cancelled_by          TEXT,                 -- customer | business | system
  cancel_reason         TEXT,
  reschedule_count      INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_token_idx ON bookings (manage_token);
CREATE INDEX IF NOT EXISTS bookings_company_time_idx ON bookings (company_id, starts_at);
CREATE INDEX IF NOT EXISTS bookings_busy_idx ON bookings (company_id, staff_id, busy_from, busy_until)
  WHERE status IN ('pending', 'confirmed');
CREATE INDEX IF NOT EXISTS bookings_session_idx ON bookings (stripe_session_id) WHERE stripe_session_id IS NOT NULL;

-- Personal data — service role only (all access goes through the API).
ALTER TABLE booking_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- ── Settings ───────────────────────────────────────────────────────────────
ALTER TABLE companies ADD COLUMN IF NOT EXISTS booking_settings JSONB;

-- ── Atomic slot claim ──────────────────────────────────────────────────────
-- Serialises bookings per (company, staff) with an advisory lock, re-checks
-- for an overlapping live booking, then inserts (or moves, for a reschedule).
-- Returns the booking id, or NULL when the slot is no longer free.
CREATE OR REPLACE FUNCTION claim_booking_slot(
  p_company     UUID,
  p_service     UUID,
  p_staff       UUID,
  p_starts      TIMESTAMPTZ,
  p_ends        TIMESTAMPTZ,
  p_busy_from   TIMESTAMPTZ,
  p_busy_until  TIMESTAMPTZ,
  p_capacity    INT,
  p_row         JSONB,
  p_exclude     UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clash INT;
  v_seats INT;
  v_id    UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_company::text || ':' || COALESCE(p_staff::text, '-')));

  SELECT COUNT(*) INTO v_clash FROM bookings b
   WHERE b.company_id = p_company
     AND b.staff_id IS NOT DISTINCT FROM p_staff
     AND b.id IS DISTINCT FROM p_exclude
     AND (b.status = 'confirmed' OR (b.status = 'pending' AND b.hold_expires_at > NOW()))
     AND b.busy_from < p_busy_until AND b.busy_until > p_busy_from
     AND NOT (COALESCE(p_capacity, 1) > 1 AND b.service_id = p_service AND b.starts_at = p_starts);
  IF v_clash > 0 THEN RETURN NULL; END IF;

  IF COALESCE(p_capacity, 1) > 1 THEN
    SELECT COALESCE(SUM(b.seats), 0) INTO v_seats FROM bookings b
     WHERE b.company_id = p_company
       AND b.staff_id IS NOT DISTINCT FROM p_staff
       AND b.id IS DISTINCT FROM p_exclude
       AND b.service_id = p_service AND b.starts_at = p_starts
       AND (b.status = 'confirmed' OR (b.status = 'pending' AND b.hold_expires_at > NOW()));
    IF v_seats + COALESCE((p_row->>'seats')::INT, 1) > p_capacity THEN RETURN NULL; END IF;
  END IF;

  IF p_exclude IS NOT NULL THEN
    UPDATE bookings SET
      starts_at = p_starts, ends_at = p_ends, busy_from = p_busy_from, busy_until = p_busy_until,
      staff_id = p_staff,
      staff_name = COALESCE(p_row->>'staff_name', staff_name),
      hold_expires_at = CASE WHEN p_row ? 'hold_expires_at' THEN (p_row->>'hold_expires_at')::TIMESTAMPTZ ELSE hold_expires_at END,
      updated_at = NOW()
     WHERE id = p_exclude
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  INSERT INTO bookings (
    company_id, service_id, service_name, staff_id, staff_name, staff_choice,
    location_id, location_label, address, starts_at, ends_at, busy_from, busy_until,
    timezone, status, hold_expires_at, seats, customer_name, customer_email,
    customer_phone, customer_timezone, answers, notes, price_cents, amount_due_cents,
    currency, payment_mode, payment_status, manage_token, source
  ) VALUES (
    p_company, p_service, p_row->>'service_name', p_staff, p_row->>'staff_name',
    COALESCE(p_row->>'staff_choice', 'any'),
    NULLIF(p_row->>'location_id', '')::UUID, p_row->>'location_label', p_row->>'address',
    p_starts, p_ends, p_busy_from, p_busy_until,
    p_row->>'timezone', COALESCE(p_row->>'status', 'pending'),
    NULLIF(p_row->>'hold_expires_at', '')::TIMESTAMPTZ,
    COALESCE((p_row->>'seats')::INT, 1),
    p_row->>'customer_name', p_row->>'customer_email', p_row->>'customer_phone',
    p_row->>'customer_timezone', COALESCE(p_row->'answers', '[]'::jsonb), p_row->>'notes',
    COALESCE((p_row->>'price_cents')::INT, 0), COALESCE((p_row->>'amount_due_cents')::INT, 0),
    COALESCE(p_row->>'currency', 'aud'), COALESCE(p_row->>'payment_mode', 'none'),
    COALESCE(p_row->>'payment_status', 'none'), p_row->>'manage_token',
    COALESCE(p_row->>'source', 'page')
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION claim_booking_slot(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, INT, JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_booking_slot(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, INT, JSONB, UUID) TO service_role;

-- ── Calendar: members only ─────────────────────────────────────────────────
-- Was "Anyone can manage" (USING true). The admin UI reads it as a signed-in
-- member; everything else goes through service-role API routes.
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage" ON calendar_events;
DROP POLICY IF EXISTS "Anyone can manage calendar_events" ON calendar_events;
DROP POLICY IF EXISTS "calendar_events_member_access" ON calendar_events;
CREATE POLICY "calendar_events_member_access" ON calendar_events FOR ALL
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

NOTIFY pgrst, 'reload schema';
