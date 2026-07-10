-- ============================================================
-- COLVY V128 — MULTIPLE PHONE NUMBERS + LOCATION ASSIGNMENT
-- A company can own several numbers, each optionally tied to a
-- business location. Migrates the existing single number over.
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_id UUID,                       -- company_locations.id (nullable = unassigned)
  phone_number TEXT NOT NULL,             -- E.164, e.g. +61...
  number_type TEXT DEFAULT 'local',       -- local | mobile
  label TEXT,                             -- optional friendly name
  is_primary BOOLEAN DEFAULT false,       -- the default caller ID for the company
  status TEXT DEFAULT 'active',           -- active | pending | released
  provisioned_by_colvy BOOLEAN DEFAULT true,
  monthly_cost NUMERIC DEFAULT 15,
  telnyx_number_id TEXT,                  -- Telnyx phone number order/id
  regulatory_bundle_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_company ON phone_numbers(company_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_location ON phone_numbers(location_id);
CREATE UNIQUE INDEX IF NOT EXISTS phone_numbers_e164_uniq ON phone_numbers(phone_number);
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage phone_numbers" ON phone_numbers;
CREATE POLICY "Anyone can manage phone_numbers" ON phone_numbers FOR ALL USING (true);

-- Let locations point at a chosen number directly too (fast lookup either way)
ALTER TABLE company_locations ADD COLUMN IF NOT EXISTS phone_number_id UUID;

-- Conversations can belong to a location (drives which number calls go out from)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS location_id UUID;

-- Migrate the existing single number from telnyx_integrations into the new
-- table (only if it isn't already there). Marks it primary.
INSERT INTO phone_numbers (company_id, phone_number, is_primary, status, provisioned_by_colvy)
SELECT ti.company_id, ti.phone_number, true, 'active', true
FROM telnyx_integrations ti
WHERE ti.phone_number IS NOT NULL
  AND ti.phone_number <> ''
  AND NOT EXISTS (SELECT 1 FROM phone_numbers pn WHERE pn.phone_number = ti.phone_number);

NOTIFY pgrst, 'reload schema';
