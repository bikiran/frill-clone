-- ============================================================
-- COLVY V142 — LEGAL PAGES (Privacy / Terms, editable from admin)
-- Global (company_id NULL) pages for colvy.com, plus optional
-- per-company overrides. Stores structured sections so different
-- headings render. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS legal_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,                       -- NULL = global colvy.com page
  slug TEXT NOT NULL,                    -- 'privacy' | 'terms'
  title TEXT NOT NULL,                   -- e.g. 'Privacy Policy'
  sections JSONB DEFAULT '[]',           -- [{ heading, body }]
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS legal_pages_global_slug ON legal_pages(slug) WHERE company_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS legal_pages_company_slug ON legal_pages(company_id, slug) WHERE company_id IS NOT NULL;

ALTER TABLE legal_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read legal_pages" ON legal_pages;
CREATE POLICY "Anyone can read legal_pages" ON legal_pages FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can manage legal_pages" ON legal_pages;
CREATE POLICY "Anyone can manage legal_pages" ON legal_pages FOR ALL USING (true);

-- Seed default global Privacy + Terms if absent.
INSERT INTO legal_pages (company_id, slug, title, sections)
SELECT NULL, 'privacy', 'Privacy Policy', '[
  {"heading":"Introduction","body":"Colvy (\"we\", \"us\") respects your privacy. This policy explains what we collect and how we use it."},
  {"heading":"Information we collect","body":"Account details you provide, and usage data needed to operate the service."},
  {"heading":"How we use information","body":"To provide, maintain and improve Colvy, and to communicate with you about the service."},
  {"heading":"Contact","body":"Questions? Email us and we will help."}
]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM legal_pages WHERE slug='privacy' AND company_id IS NULL);

INSERT INTO legal_pages (company_id, slug, title, sections)
SELECT NULL, 'terms', 'Terms of Service', '[
  {"heading":"Acceptance of terms","body":"By using Colvy you agree to these terms."},
  {"heading":"Use of the service","body":"You are responsible for the content you post and for keeping your account secure."},
  {"heading":"Availability","body":"We aim for high availability but do not guarantee uninterrupted service."},
  {"heading":"Contact","body":"Questions about these terms? Get in touch."}
]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM legal_pages WHERE slug='terms' AND company_id IS NULL);

NOTIFY pgrst, 'reload schema';
