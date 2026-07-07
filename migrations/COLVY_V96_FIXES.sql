-- ============================================================
-- COLVY V96 FIXES MIGRATION
-- Run this in the Supabase SQL editor (project: mtfhctgdayeqrguodksv)
-- Safe to run multiple times (IF NOT EXISTS everywhere).
-- ============================================================

-- 1. POLLS & SURVEYS: add company scoping
--    Without company_id, polls and surveys created on one board leaked
--    into every other company's idea panel and admin lists.
ALTER TABLE polls   ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Columns the app writes but old schemas may lack
ALTER TABLE polls   ADD COLUMN IF NOT EXISTS poll_type TEXT DEFAULT 'single_choice';
ALTER TABLE polls   ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS questions JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_polls_company   ON polls(company_id);
CREATE INDEX IF NOT EXISTS idx_surveys_company ON surveys(company_id);

-- 2. OPTIONAL BACKFILL for existing polls/surveys with no company.
--    If you only have ONE real company so far, uncomment and set its id:
-- UPDATE polls   SET company_id = 'YOUR-COMPANY-UUID' WHERE company_id IS NULL;
-- UPDATE surveys SET company_id = 'YOUR-COMPANY-UUID' WHERE company_id IS NULL;
--    (Find your company id with:  SELECT id, name, slug FROM companies;)

-- 3. VOTE COUNTER: one-time repair so ideas.votes matches reality.
--    Logged-in votes previously wrote to the votes table without updating
--    the ideas.votes counter. This sets each idea's counter to at least
--    the number of rows in the votes table (guest votes already live in
--    the counter, so we never lower it).
UPDATE ideas i
SET votes = GREATEST(COALESCE(i.votes, 0), sub.cnt)
FROM (
  SELECT idea_id, COUNT(*)::int AS cnt
  FROM votes
  GROUP BY idea_id
) sub
WHERE sub.idea_id = i.id
  AND COALESCE(i.votes, 0) < sub.cnt;

-- 4. HELP ARTICLES / ANNOUNCEMENTS: guarantee a status value so the
--    "published only" public filter can never be bypassed by NULL status.
UPDATE help_articles SET status = 'draft'     WHERE status IS NULL;
UPDATE announcements SET status = 'published' WHERE status IS NULL; -- legacy rows were public

-- Done.
