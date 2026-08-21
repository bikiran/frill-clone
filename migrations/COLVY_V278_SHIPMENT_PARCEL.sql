-- Adds an optional `parcel` JSONB to shipments so the Create Label flow can
-- persist package dimensions ({length,width,height} in cm). Optional — the
-- label API tolerates its absence (strips unknown columns and retries) — but
-- with this applied the dimensions are stored. Safe/idempotent.

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS parcel JSONB;
