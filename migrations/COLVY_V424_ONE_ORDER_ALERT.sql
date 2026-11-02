-- ============================================================
-- COLVY V424 — ONE ORDER ALERT
-- The webhook and the order syncs claim each order event (and each new
-- order's one alert) by inserting into order_chat_events; its unique index
-- on (company_id, order_id, status) is what lets exactly one of two
-- simultaneous deliveries through. V134 created that index, but a database
-- where V144 created the table first can lack it (V144 only adds a plain
-- index). This makes sure it exists. Safe to re-run.
--
-- New keys this release writes (no schema change needed):
--   order_id = 0, status = 'announced_pos:<Prexty receipt>'  → one alert per
--   in-store receipt, even when Prexty pushes the sale into WooCommerce twice.
-- ============================================================

-- Drop exact duplicates first, keeping the earliest row, or the index can't be built.
DELETE FROM order_chat_events a
 USING order_chat_events b
 WHERE a.company_id = b.company_id
   AND a.order_id = b.order_id
   AND a.status = b.status
   AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS order_chat_events_uniq
  ON order_chat_events (company_id, order_id, status);

NOTIFY pgrst, 'reload schema';

-- Verify (expect one row, order_chat_events_uniq, with UNIQUE in its definition):
-- SELECT indexname, indexdef FROM pg_indexes
--  WHERE tablename = 'order_chat_events' AND indexdef ILIKE '%unique%';

-- Rollback (not recommended: double order alerts come back):
-- DROP INDEX IF EXISTS order_chat_events_uniq;
