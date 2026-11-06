-- ============================================================
-- COLVY V431 — "I'M HERE" (GUEST CHECK-IN)
--
-- A guest taps "I'm here" on their booking page (the link in their
-- confirmation) when they arrive; the team gets an alert and the day sheet
-- shows them as here. arrived_at is when they tapped (once per booking: a
-- second tap, or a second phone, doesn't alert the team again).
--
-- Safe to run more than once. Until it's run, the button still alerts the
-- team; the booking just doesn't remember the tap.
-- ============================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS arrived_at timestamptz;

COMMENT ON COLUMN bookings.arrived_at IS 'When the guest tapped "I''m here" on their booking page (null: not yet).';
