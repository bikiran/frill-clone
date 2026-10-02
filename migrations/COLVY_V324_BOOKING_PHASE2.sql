-- COLVY V324 — Booking Phase 2: reminders, customer confirmation, follow-ups,
-- rebook nudges and personal booking links (invites).
-- Needs V323. Idempotent — safe to run more than once.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_24h_at       TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_2h_at        TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_confirmed_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completed_at          TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS review_queued_at      TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rebook_sent_at        TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS invite_id             UUID;

-- "Time for your next one?" — days after a completed visit (null = off).
ALTER TABLE booking_services ADD COLUMN IF NOT EXISTS rebook_days INT;

-- The reminder sweep looks at confirmed upcoming bookings; the follow-up
-- sweep at recently finished ones.
CREATE INDEX IF NOT EXISTS bookings_upcoming_idx ON bookings (starts_at) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS bookings_completed_idx ON bookings (completed_at) WHERE status = 'completed';

-- Personal booking links sent from the inbox: the booking lands in that
-- customer's conversation and their details are pre-filled.
CREATE TABLE IF NOT EXISTS booking_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token           TEXT NOT NULL,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id      UUID,
  conversation_id UUID,
  service_id      UUID REFERENCES booking_services(id) ON DELETE SET NULL,
  created_by      UUID,
  used_count      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);
CREATE UNIQUE INDEX IF NOT EXISTS booking_invites_token_idx ON booking_invites (token);

-- Personal data — service role only.
ALTER TABLE booking_invites ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
