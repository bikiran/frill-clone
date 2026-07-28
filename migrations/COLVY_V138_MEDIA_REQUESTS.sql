-- ============================================================
-- COLVY V138 — REQUEST MEDIA (private upload links)
-- Staff request media from a customer; the customer gets a private
-- link to upload photos/videos/PDFs/audio at full quality (no MMS
-- compression). Uploads land back in the conversation.
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS media_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,           -- unguessable link token
  company_id UUID NOT NULL,
  conversation_id UUID,
  contact_id UUID,
  prompt TEXT,                          -- "What do you need?" text
  accept TEXT[] DEFAULT ARRAY['image','video','pdf'],  -- allowed kinds
  max_files INTEGER DEFAULT 10,
  expires_at TIMESTAMPTZ,
  status TEXT DEFAULT 'open',           -- open | fulfilled | expired | cancelled
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_requests_company ON media_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_media_requests_token ON media_requests(token);
ALTER TABLE media_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage media_requests" ON media_requests;
CREATE POLICY "Anyone can manage media_requests" ON media_requests FOR ALL USING (true);

-- Files uploaded against a request.
CREATE TABLE IF NOT EXISTS media_request_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  company_id UUID NOT NULL,
  url TEXT NOT NULL,
  name TEXT,
  kind TEXT,                            -- image | video | pdf | audio
  size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_request_files_req ON media_request_files(request_id);
ALTER TABLE media_request_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage media_request_files" ON media_request_files;
CREATE POLICY "Anyone can manage media_request_files" ON media_request_files FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
