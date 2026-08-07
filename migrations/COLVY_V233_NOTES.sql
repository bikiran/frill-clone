-- ============================================================
-- COLVY V233 — NOTES
-- An Evernote-style notes surface for a company: rich body, a checklist, photo/
-- video attachments, a cover image, and optional public sharing via a short
-- code (served at {slug}.colvy.com/n/{code}) that viewers can be allowed to edit.
-- Additive and safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS notes (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID        NOT NULL,
  title              TEXT,
  body               TEXT,                                  -- rich HTML
  checklist          JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- [{id,text,done}]
  attachments        JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- [{url,name,type,kind}]
  cover_image        TEXT,
  public_code        TEXT,                                  -- set when shared
  is_public          BOOLEAN     NOT NULL DEFAULT false,
  allow_public_edit  BOOLEAN     NOT NULL DEFAULT false,
  created_by         UUID,
  created_by_name    TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_company_idx ON notes (company_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS notes_public_code_idx ON notes (public_code) WHERE public_code IS NOT NULL;

NOTIFY pgrst, 'reload schema';
