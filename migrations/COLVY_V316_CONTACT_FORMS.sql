-- COLVY_V316_CONTACT_FORMS
-- Coax-style embeddable contact forms. A business builds a form (fields, colours,
-- button label), embeds it on their website via an iframe snippet, and each
-- submission lands in the Inbox as a conversation.

CREATE TABLE IF NOT EXISTS contact_forms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL,
  name          TEXT NOT NULL DEFAULT 'Contact form',
  description   TEXT,
  fields        JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{key,label,type,required}]
  accent_color  TEXT DEFAULT '#202124',
  corner_radius INTEGER DEFAULT 12,
  alignment     TEXT DEFAULT 'center',                -- left | center
  button_label  TEXT DEFAULT 'Send message',
  success_message TEXT DEFAULT 'Thanks! We''ll be in touch shortly.',
  redirect_url  TEXT,
  location_id   UUID,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_forms_company_idx ON contact_forms (company_id);

CREATE TABLE IF NOT EXISTS contact_form_submissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id     UUID NOT NULL,
  company_id  UUID NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact_id  UUID,
  conversation_id UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_form_submissions_form_idx ON contact_form_submissions (form_id, created_at DESC);

ALTER TABLE contact_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_form_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "manage contact_forms" ON contact_forms;
CREATE POLICY "manage contact_forms" ON contact_forms FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "manage contact_form_submissions" ON contact_form_submissions;
CREATE POLICY "manage contact_form_submissions" ON contact_form_submissions FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
