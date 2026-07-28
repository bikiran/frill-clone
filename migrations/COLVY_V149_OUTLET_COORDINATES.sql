-- ============================================================
-- COLVY V149 — OUTLET COORDINATES (for nearest-outlet auto-assign)
-- Adds latitude/longitude to company_locations so the chat widget can
-- auto-select the nearest outlet for Victorian visitors. Coordinates
-- are filled by geocoding the outlet's AU address (see /api/locations/geocode).
-- Safe to re-run.
-- ============================================================

ALTER TABLE company_locations ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE company_locations ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE company_locations ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;

-- Which conversation got auto-assigned to which outlet (for display + change).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_location_id UUID;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_auto BOOLEAN DEFAULT false;

NOTIFY pgrst, 'reload schema';
