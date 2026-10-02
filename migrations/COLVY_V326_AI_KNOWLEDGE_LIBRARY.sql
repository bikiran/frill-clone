-- ============================================================
-- COLVY V326 — AI KNOWLEDGE LIBRARY
--
-- Turns ai_knowledge from a snapshot you had to rebuild by hand into a
-- library that keeps itself current:
--
--   1. Search by meaning-ish, not exact words: a full-text index (stemmed,
--      ranked) plus search_ai_knowledge(), which the app calls with the
--      customer's words and their synonyms.
--   2. Live sync: help articles, announcements, ideas/roadmap and the owner's
--      own facts are copied into ai_knowledge by triggers the moment they're
--      saved, edited or deleted. Drafts and private ideas stay out.
--   3. Facts (short answers the owner writes) and uploaded files (PDF/text,
--      stored as chunks) get their own tables.
--   4. Locks ai_knowledge down. It was readable by anyone with the public
--      key, and it can hold past conversations. Only the server reads it now.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- ── 1. Search ────────────────────────────────────────────────────────────
-- A plain unique index (NULL source_ids stay unconstrained) so the app can
-- upsert rows by (company, source, source_id).
CREATE UNIQUE INDEX IF NOT EXISTS ai_knowledge_uniq_full ON ai_knowledge (company_id, source, source_id);
DROP INDEX IF EXISTS ai_knowledge_uniq;

ALTER TABLE ai_knowledge ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE ai_knowledge ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_fts ON ai_knowledge USING GIN (fts);

-- p_query is websearch syntax ("parcel or shipping or delivery").
CREATE OR REPLACE FUNCTION search_ai_knowledge(p_company UUID, p_query TEXT, p_limit INT DEFAULT 8)
RETURNS TABLE (id UUID, source TEXT, source_id TEXT, title TEXT, content TEXT, url TEXT, rank REAL)
LANGUAGE sql STABLE AS $$
  WITH q AS (SELECT websearch_to_tsquery('english', p_query) AS tsq)
  SELECT k.id, k.source, k.source_id, k.title, k.content, k.url,
         (ts_rank_cd(k.fts, q.tsq, 32) * CASE k.source
            WHEN 'fact' THEN 1.6 WHEN 'help' THEN 1.35 WHEN 'file' THEN 1.25
            WHEN 'website' THEN 1.15 WHEN 'announcement' THEN 1.0 WHEN 'roadmap' THEN 0.9
            WHEN 'chat' THEN 0.85 ELSE 0.7 END)::REAL AS rank
    FROM ai_knowledge k, q
   WHERE k.company_id = p_company AND k.fts @@ q.tsq
   ORDER BY rank DESC
   LIMIT LEAST(GREATEST(p_limit, 1), 30);
$$;

-- ── 2. Owner-written facts and uploaded files ────────────────────────────
CREATE TABLE IF NOT EXISTS ai_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_facts_company ON ai_facts (company_id, updated_at DESC);
ALTER TABLE ai_facts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ai_knowledge_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  mime TEXT,
  size_bytes INT,
  pages INT,
  chars INT,
  chunks INT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_files_company ON ai_knowledge_files (company_id, created_at DESC);
ALTER TABLE ai_knowledge_files ENABLE ROW LEVEL SECURITY;

-- When the whole library (website, past chats) was last rebuilt.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS ai_knowledge_synced_at TIMESTAMPTZ;

-- ── 3. Live sync triggers ────────────────────────────────────────────────
-- Is this source switched on in the company's AI settings? (On unless set false.)
CREATE OR REPLACE FUNCTION ai_kn_enabled(p_company UUID, p_key TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT ai_settings->'knowledge'->>p_key FROM companies WHERE id = p_company), 'true') <> 'false';
$$;

CREATE OR REPLACE FUNCTION ai_kn_strip(p TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(replace(replace(regexp_replace(coalesce(p, ''), '<[^>]+>', ' ', 'g'),
    '&nbsp;', ' '), '&amp;', '&'), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION ai_kn_put(p_company UUID, p_source TEXT, p_id TEXT, p_title TEXT, p_content TEXT, p_url TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO ai_knowledge (company_id, source, source_id, title, content, url, indexed_at, updated_at)
  VALUES (p_company, p_source, p_id, p_title, p_content, p_url, NOW(), NOW())
  ON CONFLICT (company_id, source, source_id)
  DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, url = EXCLUDED.url, updated_at = NOW();
$$;

-- Help centre: published articles only.
CREATE OR REPLACE FUNCTION ai_kn_sync_help() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM ai_knowledge WHERE company_id = OLD.company_id AND source = 'help' AND source_id = OLD.id::text;
    RETURN OLD;
  END IF;
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  IF coalesce(NEW.status, 'published') = 'published' AND ai_kn_enabled(NEW.company_id, 'help') THEN
    PERFORM ai_kn_put(NEW.company_id, 'help', NEW.id::text, NEW.title, left(NEW.title || E'\n' || ai_kn_strip(NEW.content), 20000));
  ELSE
    DELETE FROM ai_knowledge WHERE company_id = NEW.company_id AND source = 'help' AND source_id = NEW.id::text;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ai_kn_help ON help_articles;
CREATE TRIGGER trg_ai_kn_help AFTER INSERT OR DELETE OR UPDATE OF title, content, status, company_id ON help_articles
  FOR EACH ROW EXECUTE FUNCTION ai_kn_sync_help();

-- Announcements: published only. (The text lives in `description`.)
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS description TEXT;
CREATE OR REPLACE FUNCTION ai_kn_sync_announcement() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM ai_knowledge WHERE company_id = OLD.company_id AND source = 'announcement' AND source_id = OLD.id::text;
    RETURN OLD;
  END IF;
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  IF coalesce(NEW.status, 'published') = 'published' AND ai_kn_enabled(NEW.company_id, 'announcements') THEN
    PERFORM ai_kn_put(NEW.company_id, 'announcement', NEW.id::text, NEW.title,
      left(NEW.title || E'\n' || ai_kn_strip(NEW.description), 12000));
  ELSE
    DELETE FROM ai_knowledge WHERE company_id = NEW.company_id AND source = 'announcement' AND source_id = NEW.id::text;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ai_kn_announcement ON announcements;
CREATE TRIGGER trg_ai_kn_announcement AFTER INSERT OR DELETE OR UPDATE OF title, description, status, company_id ON announcements
  FOR EACH ROW EXECUTE FUNCTION ai_kn_sync_announcement();

-- Ideas and roadmap: public, live ideas only (not private, archived or merged).
CREATE OR REPLACE FUNCTION ai_kn_sync_idea() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  visible BOOLEAN;
  st TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM ai_knowledge WHERE company_id = OLD.company_id AND source IN ('idea', 'roadmap') AND source_id = OLD.id::text;
    RETURN OLD;
  END IF;
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  st := coalesce(NEW.status, 'new');
  visible := NOT coalesce(NEW.is_private, false) AND NOT coalesce(NEW.is_archived, false) AND NOT coalesce(NEW.is_merged, false);

  IF visible AND ai_kn_enabled(NEW.company_id, 'ideas') THEN
    PERFORM ai_kn_put(NEW.company_id, 'idea', NEW.id::text, NEW.title,
      left(NEW.title || E'\n' || ai_kn_strip(NEW.description) || E'\nStatus: ' || st, 6000));
  ELSE
    DELETE FROM ai_knowledge WHERE company_id = NEW.company_id AND source = 'idea' AND source_id = NEW.id::text;
  END IF;

  IF visible AND st IN ('planned', 'in_progress', 'beta', 'shipped', 'completed') AND ai_kn_enabled(NEW.company_id, 'roadmap') THEN
    PERFORM ai_kn_put(NEW.company_id, 'roadmap', NEW.id::text, NEW.title,
      left('Roadmap (' || replace(st, '_', ' ') || '): ' || NEW.title || E'\n' || ai_kn_strip(NEW.description), 6000));
  ELSE
    DELETE FROM ai_knowledge WHERE company_id = NEW.company_id AND source = 'roadmap' AND source_id = NEW.id::text;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ai_kn_idea ON ideas;
CREATE TRIGGER trg_ai_kn_idea AFTER INSERT OR DELETE OR UPDATE OF title, description, status, is_private, is_archived, is_merged, company_id ON ideas
  FOR EACH ROW EXECUTE FUNCTION ai_kn_sync_idea();

-- Facts: always on (the owner wrote them for exactly this).
CREATE OR REPLACE FUNCTION ai_kn_sync_fact() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM ai_knowledge WHERE company_id = OLD.company_id AND source = 'fact' AND source_id = OLD.id::text;
    RETURN OLD;
  END IF;
  PERFORM ai_kn_put(NEW.company_id, 'fact', NEW.id::text, NEW.question, NEW.question || E'\n' || NEW.answer);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ai_kn_fact ON ai_facts;
CREATE TRIGGER trg_ai_kn_fact AFTER INSERT OR UPDATE OR DELETE ON ai_facts
  FOR EACH ROW EXECUTE FUNCTION ai_kn_sync_fact();

-- Deleting a file removes its chunks (source_id is "<file id>#<n>").
CREATE OR REPLACE FUNCTION ai_kn_drop_file() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM ai_knowledge WHERE company_id = OLD.company_id AND source = 'file' AND source_id LIKE OLD.id::text || '#%';
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_ai_kn_file ON ai_knowledge_files;
CREATE TRIGGER trg_ai_kn_file AFTER DELETE ON ai_knowledge_files
  FOR EACH ROW EXECUTE FUNCTION ai_kn_drop_file();

-- ── 4. Server-only access ────────────────────────────────────────────────
-- No policies = no access with the public key. The service role (used by
-- Colvy's API routes) bypasses RLS, so the app keeps working.
DROP POLICY IF EXISTS "Anyone can manage ai_knowledge" ON ai_knowledge;
ALTER TABLE ai_knowledge ENABLE ROW LEVEL SECURITY;

-- ── 5. Backfill so existing content is in the library straight away ─────
-- (Written straight into ai_knowledge, so the source rows aren't touched.)
DO $$
BEGIN
  PERFORM ai_kn_put(company_id, 'help', id::text, title, left(title || E'\n' || ai_kn_strip(content), 20000))
    FROM help_articles
   WHERE company_id IS NOT NULL AND coalesce(status, 'published') = 'published' AND ai_kn_enabled(company_id, 'help');

  PERFORM ai_kn_put(company_id, 'announcement', id::text, title, left(title || E'\n' || ai_kn_strip(description), 12000))
    FROM announcements
   WHERE company_id IS NOT NULL AND coalesce(status, 'published') = 'published' AND ai_kn_enabled(company_id, 'announcements');

  PERFORM ai_kn_put(company_id, 'idea', id::text, title, left(title || E'\n' || ai_kn_strip(description) || E'\nStatus: ' || coalesce(status, 'new'), 6000))
    FROM ideas
   WHERE company_id IS NOT NULL AND NOT coalesce(is_private, false) AND NOT coalesce(is_archived, false) AND NOT coalesce(is_merged, false)
     AND ai_kn_enabled(company_id, 'ideas');

  PERFORM ai_kn_put(company_id, 'roadmap', id::text, title, left('Roadmap (' || replace(status, '_', ' ') || '): ' || title || E'\n' || ai_kn_strip(description), 6000))
    FROM ideas
   WHERE company_id IS NOT NULL AND NOT coalesce(is_private, false) AND NOT coalesce(is_archived, false) AND NOT coalesce(is_merged, false)
     AND status IN ('planned', 'in_progress', 'beta', 'shipped', 'completed') AND ai_kn_enabled(company_id, 'roadmap');
END $$;

NOTIFY pgrst, 'reload schema';
