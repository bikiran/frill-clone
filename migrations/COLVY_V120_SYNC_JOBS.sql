-- ============================================================
-- COLVY V120 — BACKGROUND WOOCOMMERCE SYNC JOBS
-- Run as a single step (only creates one new table).
-- ============================================================

CREATE TABLE IF NOT EXISTS woo_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  status TEXT DEFAULT 'running',      -- running | completed | failed
  phase TEXT DEFAULT 'customers',     -- customers | orders | done
  current_page INT DEFAULT 1,
  total_pages INT DEFAULT 1,
  customers_synced INT DEFAULT 0,
  orders_synced INT DEFAULT 0,
  error TEXT,
  message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_woo_sync_jobs ON woo_sync_jobs(company_id, started_at DESC);
ALTER TABLE woo_sync_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage woo_sync_jobs" ON woo_sync_jobs;
CREATE POLICY "Anyone can manage woo_sync_jobs" ON woo_sync_jobs FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
