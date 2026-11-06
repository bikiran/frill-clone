-- ============================================================
-- COLVY V430 — RESTAURANTS (PHASE 2: TABLES, FLOOR PLAN, DEPOSITS)
--
-- Tables a restaurant seats guests at, the floor plan they sit on, and which
-- table each reservation has. docs/plans/restaurants.md (Phase 2).
--
--   restaurant_areas          Inside, Courtyard, Bar… (tabs on the floor plan)
--   restaurant_tables         one row per table: label, party range, where it
--                             sits on the plan (x, y, w, h in grid squares),
--                             shape, whether it can be booked online and
--                             combined, and "unavailable until"
--   restaurant_table_combos   tables pushed together for a bigger party
--   reservation_tables        which table(s) a reservation has, for its time.
--                             An exclusion constraint makes a double booking
--                             impossible: no two active rows for one table may
--                             overlap in time, whatever path wrote them. A
--                             combo writes one row per table, so a combined
--                             table can't also be booked on its own.
--   claim_table_reservation() the Phase 1 claim (covers, pacing) plus table
--                             choice: the team's pick, or the smallest free
--                             table that fits, then the smallest free combo, in
--                             the same locked transaction. Returns JSON:
--                             { ok, id, tables } or { ok: false, reason }.
--   a trigger on bookings     frees a reservation's tables when it's cancelled,
--                             expires, finishes or is a no-show, and gives them
--                             back if that's undone (unless someone else has
--                             the table by then).
--
-- Deposits use the booking payment columns that already exist
-- (amount_due_cents, payment_mode, payment_status, chat_payment_id).
--
-- Needs the btree_gist extension (free on every Supabase project). Access:
-- server only (RLS on, no policies). Run in the Supabase SQL editor.
-- Safe to re-run. Rollback at the bottom.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- ── Areas and tables ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.restaurant_areas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  sort        INT NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS restaurant_areas_company_idx ON public.restaurant_areas (company_id, sort);

CREATE TABLE IF NOT EXISTS public.restaurant_tables (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  area_id           UUID REFERENCES public.restaurant_areas(id) ON DELETE SET NULL,
  label             TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 20),
  min_party         INT NOT NULL DEFAULT 1 CHECK (min_party BETWEEN 1 AND 100),
  max_party         INT NOT NULL DEFAULT 2 CHECK (max_party BETWEEN 1 AND 100),
  x                 NUMERIC NOT NULL DEFAULT 0,
  y                 NUMERIC NOT NULL DEFAULT 0,
  w                 NUMERIC NOT NULL DEFAULT 2 CHECK (w > 0 AND w <= 20),
  h                 NUMERIC NOT NULL DEFAULT 2 CHECK (h > 0 AND h <= 20),
  shape             TEXT NOT NULL DEFAULT 'rect' CHECK (shape IN ('rect', 'round')),
  rotation          INT NOT NULL DEFAULT 0,
  combinable        BOOLEAN NOT NULL DEFAULT TRUE,
  online            BOOLEAN NOT NULL DEFAULT TRUE,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  unavailable_until TIMESTAMPTZ,
  unavailable_note  TEXT,
  sort              INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT restaurant_tables_party_range CHECK (max_party >= min_party)
);
CREATE INDEX IF NOT EXISTS restaurant_tables_company_idx ON public.restaurant_tables (company_id) WHERE active;
-- One live table per label in a restaurant ("4" can't exist twice).
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_tables_label_uq ON public.restaurant_tables (company_id, lower(label)) WHERE active;

CREATE TABLE IF NOT EXISTS public.restaurant_table_combos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  table_ids   UUID[] NOT NULL CHECK (cardinality(table_ids) BETWEEN 2 AND 8),
  min_party   INT NOT NULL DEFAULT 1 CHECK (min_party BETWEEN 1 AND 200),
  max_party   INT NOT NULL CHECK (max_party BETWEEN 1 AND 200),
  online      BOOLEAN NOT NULL DEFAULT TRUE,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT restaurant_table_combos_party_range CHECK (max_party >= min_party)
);
CREATE INDEX IF NOT EXISTS restaurant_table_combos_company_idx ON public.restaurant_table_combos (company_id) WHERE active;

-- ── Which table a reservation has ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reservation_tables (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  booking_id  UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  table_id    UUID NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
  combo_id    UUID REFERENCES public.restaurant_table_combos(id) ON DELETE SET NULL,
  busy        TSTZRANGE NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$ BEGIN
  ALTER TABLE public.reservation_tables
    ADD CONSTRAINT reservation_tables_no_overlap EXCLUDE USING gist (table_id WITH =, busy WITH &&) WHERE (active);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS reservation_tables_booking_idx ON public.reservation_tables (booking_id);
CREATE INDEX IF NOT EXISTS reservation_tables_company_idx ON public.reservation_tables (company_id) WHERE active;

ALTER TABLE public.restaurant_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_table_combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_tables ENABLE ROW LEVEL SECURITY;

-- ── Tables follow their reservation ──────────────────────────────────────────
-- Cancelled, expired, finished or a no-show: the table is free again. Undoing
-- a finish or a no-show gives back the tables it last had, for its times, if
-- nobody else has them now (otherwise it stays without a table and the team
-- picks one).
CREATE OR REPLACE FUNCTION public.reservation_tables_follow_booking() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'expired', 'no_show', 'completed') THEN
    UPDATE reservation_tables SET active = FALSE WHERE booking_id = NEW.id AND active;
  ELSIF NEW.status IN ('confirmed', 'pending') AND OLD.status IN ('completed', 'no_show') THEN
    BEGIN
      UPDATE reservation_tables SET active = TRUE, busy = tstzrange(NEW.starts_at, NEW.ends_at, '[)')
       WHERE booking_id = NEW.id AND NOT active
         AND created_at = (SELECT MAX(created_at) FROM reservation_tables WHERE booking_id = NEW.id);
    EXCEPTION WHEN exclusion_violation THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bookings_reservation_tables ON public.bookings;
CREATE TRIGGER bookings_reservation_tables
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.reservation_tables_follow_booking();

-- ── Atomic claim with tables ─────────────────────────────────────────────────
-- Same lock and covers/pacing rules as claim_reservation (V429), then tables:
--   p_use_tables     the restaurant seats by table (it has tables, the setting
--                    is on). FALSE: covers only, as in Phase 1.
--   p_tables         the team's pick (all must be free), '{}' for no table, or
--                    NULL to choose: the smallest free table whose party range
--                    fits (the preferred area first), else the smallest free
--                    combo whose tables are all free.
--   p_require_table  no free table → refuse (online bookings). The team can
--                    book without one and seat them later.
--   p_online_only    only tables and combos that can be booked online.
-- Inserts the booking, or moves it (p_exclude) and swaps its tables. The
-- booking's payment columns come from p_row (deposits).
CREATE OR REPLACE FUNCTION public.claim_table_reservation(
  p_company        UUID,
  p_service        UUID,
  p_starts         TIMESTAMPTZ,
  p_ends           TIMESTAMPTZ,
  p_party          INT,
  p_max_covers     INT,
  p_pace_covers    INT,
  p_pace_mins      INT,
  p_row            JSONB,
  p_exclude        UUID DEFAULT NULL,
  p_tables         UUID[] DEFAULT NULL,
  p_use_tables     BOOLEAN DEFAULT TRUE,
  p_require_table  BOOLEAN DEFAULT FALSE,
  p_online_only    BOOLEAN DEFAULT FALSE,
  p_area           UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_peak    INT;
  v_pace    INT;
  v_id      UUID;
  v_slot    TIMESTAMPTZ;
  v_span    TSTZRANGE;
  v_tables  UUID[];
  v_combo   UUID;
BEGIN
  IF p_party IS NULL OR p_party < 1 OR p_ends <= p_starts THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid');
  END IF;
  -- The same key as claim_reservation, so the two never run side by side.
  PERFORM pg_advisory_xact_lock(hashtext('reservation:' || p_company::text || ':' || p_service::text));
  v_span := tstzrange(p_starts, p_ends, '[)');

  -- Holds that lapsed (an unfinished online booking or deposit) let go of their tables.
  UPDATE reservation_tables rt SET active = FALSE
    FROM bookings b
   WHERE rt.booking_id = b.id AND rt.company_id = p_company AND rt.active
     AND b.status = 'pending' AND (b.hold_expires_at IS NULL OR b.hold_expires_at <= NOW());

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
    IF v_peak + p_party > p_max_covers THEN RETURN jsonb_build_object('ok', FALSE, 'reason', 'full'); END IF;
  END IF;

  IF COALESCE(p_pace_covers, 0) > 0 AND COALESCE(p_pace_mins, 0) > 0 THEN
    v_slot := to_timestamp(floor(extract(epoch FROM p_starts) / (p_pace_mins * 60)) * (p_pace_mins * 60));
    SELECT COALESCE(SUM(b.seats), 0) INTO v_pace FROM bookings b
     WHERE b.company_id = p_company AND b.service_id = p_service
       AND b.id IS DISTINCT FROM p_exclude
       AND (b.status = 'confirmed' OR (b.status = 'pending' AND b.hold_expires_at > NOW()))
       AND b.starts_at >= v_slot AND b.starts_at < v_slot + make_interval(mins => p_pace_mins);
    IF v_pace + p_party > p_pace_covers THEN RETURN jsonb_build_object('ok', FALSE, 'reason', 'pace'); END IF;
  END IF;

  v_tables := '{}';
  IF COALESCE(p_use_tables, TRUE) THEN
    IF p_tables IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM unnest(p_tables) AS want(id)
         WHERE NOT EXISTS (SELECT 1 FROM restaurant_tables t WHERE t.id = want.id AND t.company_id = p_company AND t.active)
      ) THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'bad_table');
      END IF;
      IF EXISTS (
        SELECT 1 FROM reservation_tables x
         WHERE x.table_id = ANY (p_tables) AND x.active AND x.busy && v_span
           AND x.booking_id IS DISTINCT FROM p_exclude
      ) THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'table_busy');
      END IF;
      v_tables := p_tables;
    ELSE
      SELECT ARRAY[t.id] INTO v_tables
        FROM restaurant_tables t
       WHERE t.company_id = p_company AND t.active
         AND (NOT COALESCE(p_online_only, FALSE) OR t.online)
         AND p_party BETWEEN t.min_party AND t.max_party
         AND (t.unavailable_until IS NULL OR t.unavailable_until <= p_starts)
         AND NOT EXISTS (
           SELECT 1 FROM reservation_tables x
            WHERE x.table_id = t.id AND x.active AND x.busy && v_span
              AND x.booking_id IS DISTINCT FROM p_exclude
         )
       ORDER BY (p_area IS NOT NULL AND t.area_id IS NOT DISTINCT FROM p_area) DESC, t.max_party, t.sort, t.label
       LIMIT 1;
      IF v_tables IS NULL THEN
        SELECT c.table_ids, c.id INTO v_tables, v_combo
          FROM restaurant_table_combos c
         WHERE c.company_id = p_company AND c.active
           AND (NOT COALESCE(p_online_only, FALSE) OR c.online)
           AND p_party BETWEEN c.min_party AND c.max_party
           AND NOT EXISTS (
             SELECT 1 FROM unnest(c.table_ids) AS m(id)
               LEFT JOIN restaurant_tables t ON t.id = m.id AND t.company_id = p_company
              WHERE t.id IS NULL OR NOT t.active
                 OR (t.unavailable_until IS NOT NULL AND t.unavailable_until > p_starts)
                 OR EXISTS (
                   SELECT 1 FROM reservation_tables x
                    WHERE x.table_id = m.id AND x.active AND x.busy && v_span
                      AND x.booking_id IS DISTINCT FROM p_exclude
                 )
           )
         ORDER BY c.max_party, cardinality(c.table_ids), c.name
         LIMIT 1;
      END IF;
      v_tables := COALESCE(v_tables, '{}');
      IF cardinality(v_tables) = 0 AND COALESCE(p_require_table, FALSE) THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_table');
      END IF;
    END IF;
  END IF;

  IF p_exclude IS NOT NULL THEN
    UPDATE bookings SET
      starts_at = p_starts, ends_at = p_ends, busy_from = p_starts, busy_until = p_ends,
      seats = p_party,
      service_name = COALESCE(p_row->>'service_name', service_name),
      updated_at = NOW()
     WHERE id = p_exclude AND company_id = p_company AND service_id = p_service
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found'); END IF;
    UPDATE reservation_tables SET active = FALSE WHERE booking_id = v_id AND active;
  ELSE
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
      COALESCE(NULLIF(p_row->>'price_cents', '')::INT, 0), COALESCE(NULLIF(p_row->>'amount_due_cents', '')::INT, 0),
      COALESCE(p_row->>'currency', 'aud'), COALESCE(p_row->>'payment_mode', 'none'), COALESCE(p_row->>'payment_status', 'none'),
      p_row->>'manage_token', COALESCE(p_row->>'source', 'page'),
      NULLIF(p_row->>'seating_pref', ''), NULLIF(p_row->>'occasion', ''), NULLIF(p_row->>'internal_notes', ''),
      NULLIF(p_row->>'contact_id', '')::UUID, NULLIF(p_row->>'seated_at', '')::TIMESTAMPTZ
    ) RETURNING id INTO v_id;
  END IF;

  IF cardinality(v_tables) > 0 THEN
    INSERT INTO reservation_tables (company_id, booking_id, table_id, combo_id, busy)
    SELECT p_company, v_id, t, v_combo, v_span FROM unnest(v_tables) AS t;
  END IF;
  RETURN jsonb_build_object('ok', TRUE, 'id', v_id, 'tables', to_jsonb(v_tables));
END;
$$;
REVOKE ALL ON FUNCTION public.claim_table_reservation(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, INT, INT, JSONB, UUID, UUID[], BOOLEAN, BOOLEAN, BOOLEAN, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_table_reservation(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, INT, INT, JSONB, UUID, UUID[], BOOLEAN, BOOLEAN, BOOLEAN, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.reservation_tables_follow_booking() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Rollback (in this order; reservations themselves are untouched):
--   DROP TRIGGER IF EXISTS bookings_reservation_tables ON public.bookings;
--   DROP FUNCTION IF EXISTS public.reservation_tables_follow_booking();
--   DROP FUNCTION IF EXISTS public.claim_table_reservation(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, INT, INT, JSONB, UUID, UUID[], BOOLEAN, BOOLEAN, BOOLEAN, UUID);
--   DROP TABLE IF EXISTS public.reservation_tables;
--   DROP TABLE IF EXISTS public.restaurant_table_combos;
--   DROP TABLE IF EXISTS public.restaurant_tables;
--   DROP TABLE IF EXISTS public.restaurant_areas;
-- ============================================================
