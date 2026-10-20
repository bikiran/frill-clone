-- COLVY_V409 — put each Prexty POS sale under the shop it was rung up at.
--
-- A business with two shops (Roxy Aquarium Somerton and Oakleigh) has two
-- Prexty outlets and two Colvy locations, but every in-store sale landed
-- unassigned and showed as "Website" in the inbox.
--
--   prexty_integrations.outlet_map   Prexty outlet name (lower-case) → Colvy
--                                    location id, set on the Prexty settings
--                                    page. Outlets not in the map are matched
--                                    by name when it's unambiguous.
--   woocommerce_orders.pos_location_id
--                                    the location the sale was matched to, so
--                                    the order card can name the shop.
--
-- Safe to run twice. Until it runs, sales are still matched by name; nothing
-- is stored and nothing else changes.
--
-- Rollback:
--   ALTER TABLE prexty_integrations DROP COLUMN IF EXISTS outlet_map;
--   ALTER TABLE woocommerce_orders  DROP COLUMN IF EXISTS pos_location_id;

ALTER TABLE prexty_integrations ADD COLUMN IF NOT EXISTS outlet_map JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE woocommerce_orders  ADD COLUMN IF NOT EXISTS pos_location_id UUID;

CREATE INDEX IF NOT EXISTS idx_woo_orders_pos_outlet
  ON woocommerce_orders(company_id, pos_outlet) WHERE pos_source = 'prexty';

NOTIFY pgrst, 'reload schema';
