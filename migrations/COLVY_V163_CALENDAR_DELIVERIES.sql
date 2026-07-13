-- ============================================================
-- COLVY V163 — CALENDAR + SCHEDULED DELIVERIES
--
-- One calendar for the whole team: deliveries, appointments, bookings and
-- tasks all land in calendar_events. Events can be scoped to an outlet so
-- each shop sees its own runs, and everyone can see the whole picture.
--
-- PREXTY SYNC (not built yet):
--   Prexty POS has no public API available to us at the time of writing, so
--   nothing syncs to it. The schema is deliberately ready for it:
--     external_source   — 'prexty' once we sync
--     external_id       — Prexty's own id for the event
--     synced_at         — when we last reconciled
--   When Prexty exposes an API, the sync writes into these columns; nothing
--   else has to change. Do NOT assume Prexty sync works until that's built.
--
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,

  -- What kind of thing is this?
  event_type TEXT NOT NULL DEFAULT 'appointment',
    -- delivery | appointment | booking | task | pickup

  title TEXT NOT NULL,
  notes TEXT,

  -- When. All-day events leave the times null and set is_all_day.
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  is_all_day BOOLEAN DEFAULT false,
  -- Human time window for deliveries, e.g. "10am – 2pm".
  time_window TEXT,

  -- Who / where it relates to.
  location_id UUID,            -- which outlet owns this
  contact_id UUID,             -- the customer
  conversation_id UUID,        -- the chat it was scheduled from
  order_id TEXT,               -- WooCommerce order, if any
  assigned_to UUID,            -- team member responsible

  -- Delivery specifics
  address TEXT,
  status TEXT DEFAULT 'scheduled',
    -- scheduled | confirmed | in_progress | completed | cancelled | missed

  -- Prexty (or any future POS) sync — NOT ACTIVE YET, see note above.
  external_source TEXT,
  external_id TEXT,
  synced_at TIMESTAMPTZ,

  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_company_time
  ON calendar_events (company_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_calendar_location
  ON calendar_events (company_id, location_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_calendar_contact
  ON calendar_events (company_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_calendar_conversation
  ON calendar_events (conversation_id);
CREATE UNIQUE INDEX IF NOT EXISTS calendar_external_uniq
  ON calendar_events (company_id, external_source, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage calendar_events" ON calendar_events;
CREATE POLICY "Anyone can manage calendar_events" ON calendar_events FOR ALL USING (true);

-- Delivery tracking updates that the customer can be told about.
CREATE TABLE IF NOT EXISTS delivery_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  calendar_event_id UUID,
  order_id TEXT,
  status TEXT NOT NULL,        -- scheduled | out_for_delivery | delivered | failed
  note TEXT,
  notified BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_delivery_updates_event
  ON delivery_updates (calendar_event_id, created_at DESC);
ALTER TABLE delivery_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage delivery_updates" ON delivery_updates;
CREATE POLICY "Anyone can manage delivery_updates" ON delivery_updates FOR ALL USING (true);

-- Delivery settings per company (windows offered, whether to auto-notify).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS delivery_settings JSONB DEFAULT '{}'::jsonb;
-- e.g. { "windows": ["9am – 12pm", "12pm – 3pm", "3pm – 6pm"], "notify_customer": true }

NOTIFY pgrst, 'reload schema';
