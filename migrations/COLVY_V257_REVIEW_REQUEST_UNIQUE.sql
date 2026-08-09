-- ============================================================
-- COLVY V257 — ONE REVIEW REQUEST PER ORDER
-- The WooCommerce "order completed" webhook schedules a review_request with a
-- racy select-then-insert (SELECT ... where not seen, then INSERT). If Woo
-- delivers the completed webhook twice (common), two handlers both see "not
-- seen" and insert two rows for the same order — so the dispatcher later sends
-- the review request twice. Enforce it in the database instead.
--
-- First de-duplicate any existing rows (keep one per company+order), then add a
-- unique index. order_id NULLs stay distinct in Postgres, so ad-hoc
-- (non-order) review requests are unaffected.
--
-- Safe to re-run.
-- ============================================================

-- Keep the earliest row per (company_id, order_id); drop the rest.
DELETE FROM review_requests a
USING review_requests b
WHERE a.order_id IS NOT NULL
  AND a.company_id = b.company_id
  AND a.order_id = b.order_id
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS review_requests_company_order_uniq
  ON review_requests (company_id, order_id);
