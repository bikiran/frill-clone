-- V213 — Default outlet per team member.
--
-- Lets each team member be assigned a "home" outlet (company_locations.id). The
-- Tasks page uses it to default the outlet filter (and "assigned to me") for that
-- member when they arrive. Nullable and safe to re-run.

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS default_location_id UUID;
