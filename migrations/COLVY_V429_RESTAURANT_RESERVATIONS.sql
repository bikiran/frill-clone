-- ============================================================
-- COLVY V429 — RESTAURANTS (PHASE 1: TABLE RESERVATIONS)
--
-- Reservations are bookings. A restaurant gets one booking service of kind
-- 'reservation' ("Table reservation"); each reservation is a row in
-- public.bookings on that service, so the manage link, confirmations,
-- reminders, the team Calendar, review requests and the customer's record all
-- work as they do for appointments. docs/plans/restaurants.md has the plan.
--
--   bookings.seats            the party size (already there; was always 1)
--   bookings.seating_pref     any | indoor | outdoor | bar
--   bookings.occasion         birthday, anniversary… (free text, optional)
--   bookings.internal_notes   for the team only (never shown to the guest)
--   bookings.seated_at        when the party sat down. A seated reservation
--                             stays 'confirmed' (so every reminder, calendar
--                             and wrap-up path keeps treating it as live);
--                             "seated" is confirmed + seated_at.
--   companies.restaurant_settings  service hours, interval, dining times by
--                             party size, party limits, covers, notice,
--                             cancellation window, booking page text
--   contacts.birthday, contacts.guest_profile { vip, allergies, seating_pref, notes }
--   claim_reservation()       the atomic "are there still seats? then take
--                             them": one advisory lock per (company, service),
--                             re-counts covers, inserts or moves the booking
--   claim_booking_slot()      now ignores reservation rows, so a restaurant's
--                             tables never block its appointment times
--
-- Access: bookings stay server-only (V323). Run in the Supabase SQL editor.
-- Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── Reservation details on bookings ──────────────────────────────────────────
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS seating_pref TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS occasion TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS seated_at TIMESTAMPTZ;
DO $$ BEGIN
  -- NOT VALID: checks new and changed rows only, so old rows can never stop the migration.
  ALTER TABLE public.bookings ADD CONSTRAINT bookings_seats_positive CHECK (seats >= 1 AND seats <= 500) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- The day sheet and the covers count: live reservations by service and time.
CREATE INDEX IF NOT EXISTS bookings_service_time_live_idx
  ON public.bookings (company_id, service_id, starts_at)
  WHERE status IN ('pending', 'confirmed');

-- ── Settings and guests ──────────────────────────────────────────────────────
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS restaurant_settings JSONB;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS modules JSONB NOT NULL DEFAULT '{}'::jsonb;  -- from V427; here too in case V427 wasn't run
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS guest_profile JSONB;

-- ── Atomic claim for a table reservation ─────────────────────────────────────
-- Serialises every reservation on one service with an advisory lock, then:
--   • p_max_covers   most guests seated at once: the busiest moment inside the
--                    new reservation's time (its start, or any later start
--                    inside it) plus this party must fit;
--   • p_pace_covers  most guests arriving in one interval (kitchen pacing):
--                    guests starting in [slot, slot + p_pace_mins) plus this
--                    party must fit.
-- NULL or 0 for a limit = no limit (the team booking over the top). Inserts the
-- booking, or moves it when p_exclude is set (party size and times). Returns
-- the booking id, or NULL when there's no room.
CREATE OR REPLACE FUNCTION public.claim_reservation(
  p_company      UUID,
  p_service      UUID,
  p_starts       TIMESTAMPTZ,
  p_ends         TIMESTAMPTZ,
  p_party        INT,
  p_max_covers   INT,
  p_pace_covers  INT,
  p_pace_mins    INT,
  p_row          JSONB,
  p_exclude      UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_peak  INT;
  v_pace  INT;
  v_id    UUID;
  v_slot  TIMESTAMPTZ;
BEGIN
  IF p_party IS NULL OR p_party < 1 OR p_ends <= p_starts THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('reservation:' || p_company::text || ':' || p_service::text));

  IF COALESCE(p_max_covers, 0) > 0 THEN
    SELECT COALESCE(MAX(t.load), 0) INTO v_peak FROM (
      SELECT (
        SELECT COALESCE(SUM(b2.seats), 0) FROM bookings b2
         WHERE b2.company_id = p_company AND b2.service_id = p_service
           AND b2.id IS DISTINCT FROM p_exclude
           AND (b2.status = 'confirmed' OR (b2.status = 'pending' AND b2.hold_expires_at > NOW()))
           AND b2.starts_at <= pts.at AND b2.ends_at > pts.at
      ) AS load
      FROM (
        SELECT p_starts AS at
        UNION
        SELECT b.starts_at FROM bookings b
         WHERE b.company_id = p_company AND b.service_id = p_service
           AND b.id IS DISTINCT FROM p_exclude
           AND (b.status = 'confirmed' OR (b.status = 'pending' AND b.hold_expires_at > NOW()))
           AND b.starts_at > p_starts AND b.starts_at < p_ends
      ) pts
    ) t;
    IF v_peak + p_party > p_max_covers THEN RETURN NULL; END IF;
  END IF;

  IF COALESCE(p_pace_covers, 0) > 0 AND COALESCE(p_pace_mins, 0) > 0 THEN
    v_slot := to_timestamp(floor(extract(epoch FROM p_starts) / (p_pace_mins * 60)) * (p_pace_mins * 60));
    SELECT COALESCE(SUM(b.seats), 0) INTO v_pace FROM bookings b
     WHERE b.company_id = p_company AND b.service_id = p_service
       AND b.id IS DISTINCT FROM p_exclude
       AND (b.status = 'confirmed' OR (b.status = 'pending' AND b.hold_expires_at > NOW()))
       AND b.starts_at >= v_slot AND b.starts_at < v_slot + make_interval(mins => p_pace_mins);
    IF v_pace + p_party > p_pace_covers THEN RETURN NULL; END IF;
  END IF;

  IF p_exclude IS NOT NULL THEN
    UPDATE bookings SET
      starts_at = p_starts, ends_at = p_ends, busy_from = p_starts, busy_until = p_ends,
      seats = p_party,
      service_name = COALESCE(p_row->>'service_name', service_name),
      updated_at = NOW()
     WHERE id = p_exclude AND company_id = p_company AND service_id = p_service
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  INSERT INTO bookings (
    company_id, service_id, service_name, staff_id, staff_name, staff_choice,
    location_id, location_label, starts_at, ends_at, busy_from, busy_until,
    timezone, status, hold_expires_at, seats, customer_name, customer_email,
    customer_phone, customer_timezone, answers, notes, price_cents, amount_due_cents,
    currency, payment_mode, payment_status, manage_token, source,
    seating_pref, occasion, internal_notes, contact_id, seated_at
  ) VALUES (
    p_company, p_service, p_row->>'service_name', NULL, NULL, 'any',
    NULLIF(p_row->>'location_id', '')::UUID, p_row->>'location_label',
    p_starts, p_ends, p_starts, p_ends,
    p_row->>'timezone', COALESCE(p_row->>'status', 'pending'),
    NULLIF(p_row->>'hold_expires_at', '')::TIMESTAMPTZ,
    p_party,
    p_row->>'customer_name', p_row->>'customer_email', p_row->>'customer_phone',
    p_row->>'customer_timezone', COALESCE(p_row->'answers', '[]'::jsonb), p_row->>'notes',
    0, 0, COALESCE(p_row->>'currency', 'aud'), 'none', 'none', p_row->>'manage_token',
    COALESCE(p_row->>'source', 'page'),
    NULLIF(p_row->>'seating_pref', ''), NULLIF(p_row->>'occasion', ''), NULLIF(p_row->>'internal_notes', ''),
    NULLIF(p_row->>'contact_id', '')::UUID, NULLIF(p_row->>'seated_at', '')::TIMESTAMPTZ
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_reservation(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, INT, INT, JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reservation(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, INT, INT, JSONB, UUID) TO service_role;

-- ── Appointments ignore reservations ─────────────────────────────────────────
-- Same as V323 with one change: a reservation (a booking on a 'reservation'
-- service) never counts as a clash for an appointment. Without it, a business
-- with no bookable staff would have its appointment times blocked by tables.
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
     AND NOT (COALESCE(p_capacity, 1) > 1 AND b.service_id = p_service AND b.starts_at = p_starts)
     AND NOT EXISTS (SELECT 1 FROM booking_services s WHERE s.id = b.service_id AND s.kind = 'reservation');
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

-- ============================================================
-- Rollback (run by hand if ever needed; reservations stay as plain bookings):
--   DROP FUNCTION IF EXISTS public.claim_reservation(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, INT, INT, JSONB, UUID);
--   -- re-run the claim_booking_slot definition from COLVY_V323_BOOKINGS.sql
--   DROP INDEX IF EXISTS public.bookings_service_time_live_idx;
--   ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_seats_positive;
--   ALTER TABLE public.bookings DROP COLUMN IF EXISTS seating_pref, DROP COLUMN IF EXISTS occasion,
--     DROP COLUMN IF EXISTS internal_notes, DROP COLUMN IF EXISTS seated_at;
--   ALTER TABLE public.companies DROP COLUMN IF EXISTS restaurant_settings;
--   ALTER TABLE public.contacts DROP COLUMN IF EXISTS birthday, DROP COLUMN IF EXISTS guest_profile;
-- ============================================================
