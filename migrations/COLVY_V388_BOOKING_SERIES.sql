-- ============================================================
-- COLVY V388 — REGULAR BOOKINGS: bookings.series_id
--
-- The team can repeat a booking every N weeks (fortnightly tank maintenance,
-- say) from Bookings → ⋯ → Repeat. Each visit is an ordinary booking with its
-- own reminders, manage link and calendar event; series_id joins the visits
-- of one series so the list can show "Regular" and the team can cancel the
-- rest of a series in one go.
--
--   bookings.series_id  uuid  NULL = a one-off booking (every existing row)
--
-- No new table and no change to access: bookings stays service-role only
-- (RLS on, no policies — V323), and everything goes through /api/bookings,
-- which checks requireCompanyAccess.
--
-- Timing: any time, before or after deploying the code. Before it runs the
-- code still repeats bookings; the visits just aren't linked (no "Regular"
-- chip, no "cancel later visits too").
--
-- Idempotent: safe to run more than once.
--
-- Rollback:
--   DROP INDEX IF EXISTS bookings_series_idx;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS series_id;
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'bookings') THEN
    ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS series_id UUID;
    CREATE INDEX IF NOT EXISTS bookings_series_idx
      ON public.bookings (company_id, series_id, starts_at) WHERE series_id IS NOT NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
