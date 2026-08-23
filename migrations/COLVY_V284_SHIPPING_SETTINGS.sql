-- ============================================================
-- COLVY V284 — SHIPPING SETTINGS (Orders & Fulfillment)
-- Per-company shipping preferences, e.g. which of the provider's carriers to
-- include in live rate quotes. Managed from Orders → Shipping. Safe to re-run.
--   shipping_settings = { enabled_carrier_ids: ["se-123", ...] }
-- An empty/absent enabled_carrier_ids means "quote all connected carriers".
-- ============================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS shipping_settings JSONB DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
