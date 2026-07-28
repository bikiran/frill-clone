-- ============================================================
-- STEP 1: Check for duplicate rows (same key + company_id)
-- ============================================================
SELECT key, company_id, COUNT(*) AS row_count
FROM site_settings
GROUP BY key, company_id
HAVING COUNT(*) > 1
ORDER BY row_count DESC;

-- ============================================================
-- STEP 2: If step 1 shows any rows, run this to keep only the
-- most recently updated row per (key, company_id) and delete
-- the rest.
-- ============================================================
DELETE FROM site_settings a
USING site_settings b
WHERE a.key = b.key
  AND a.company_id IS NOT DISTINCT FROM b.company_id
  AND a.id <> b.id
  AND (
    a.updated_at < b.updated_at
    OR (a.updated_at = b.updated_at AND a.id < b.id)
  );

-- ============================================================
-- STEP 3: Verify no duplicates remain
-- ============================================================
SELECT key, company_id, COUNT(*) AS row_count
FROM site_settings
GROUP BY key, company_id
HAVING COUNT(*) > 1;

-- ============================================================
-- STEP 4: Confirm final state
-- ============================================================
SELECT id, key, company_id, updated_at FROM site_settings ORDER BY updated_at DESC;
