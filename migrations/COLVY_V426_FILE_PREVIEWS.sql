-- ============================================================
-- COLVY V426 — FILES IN THE CONVERSATION LIST PREVIEW
--
-- An email that was only a file (a customer's "Jeb Order Labels.pdf", no text)
-- was saved with a blank preview, so the conversation list said "No messages
-- yet" (Gmail) or "Sent an attachment" (forwarded email). New emails now save
-- "📎 <file name>" ("📎 Jeb Order Labels.pdf and 2 more", "🖼️ Photo"), which
-- the list (web and app) shows as a file chip in the file type's colour.
--
-- This fills in the same preview for conversations already in the list whose
-- newest message is an email with files and no text. Only a blank preview or
-- the old "Sent … attachment(s)" wording is changed; nothing else is touched.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

WITH targets AS (
  SELECT c.id
  FROM conversations c
  WHERE COALESCE(btrim(c.last_message), '') = ''
     OR c.last_message ~ '^Sent (an|[0-9]+) attachments?$'
),
newest AS (
  SELECT t.id AS conversation_id, m.email_attachments AS files
  FROM targets t
  CROSS JOIN LATERAL (
    SELECT content, email_attachments
    FROM messages
    WHERE conversation_id = t.id
    ORDER BY created_at DESC
    LIMIT 1
  ) m
  WHERE COALESCE(btrim(m.content), '') = ''
    AND jsonb_typeof(m.email_attachments) = 'array'
    AND jsonb_array_length(m.email_attachments) > 0
),
items AS (
  SELECT n.conversation_id, e.f, e.i,
    COALESCE(e.f->>'inline', '') = 'true' AS inline,
    (COALESCE(e.f->>'mime', e.f->>'type', '') ILIKE 'image/%'
      OR COALESCE(e.f->>'name', '') ~* '\.(png|jpe?g|gif|webp|heic|heif)$') AS picture
  FROM newest n
  CROSS JOIN LATERAL jsonb_array_elements(n.files) WITH ORDINALITY AS e(f, i)
  WHERE jsonb_typeof(e.f) = 'object'
),
own AS (
  -- A picture shown inside the email (a signature logo) isn't one of its
  -- files, unless pictures are all it has.
  SELECT it.*
  FROM items it
  WHERE NOT it.inline
     OR NOT EXISTS (SELECT 1 FROM items o WHERE o.conversation_id = it.conversation_id AND NOT o.inline)
),
summary AS (
  SELECT conversation_id,
    count(*) AS total,
    count(*) FILTER (WHERE NOT picture) AS docs,
    (array_agg(NULLIF(btrim(regexp_replace(f->>'name', '\s+', ' ', 'g')), '') ORDER BY i) FILTER (WHERE NOT picture))[1] AS first_doc
  FROM own
  GROUP BY conversation_id
)
UPDATE conversations c
SET last_message = LEFT(CASE
    WHEN s.docs = 0 THEN CASE WHEN s.total > 1 THEN '🖼️ ' || s.total || ' photos' ELSE '🖼️ Photo' END
    ELSE '📎 ' || COALESCE(s.first_doc, 'Attachment')
      || CASE WHEN s.total > 1 THEN ' and ' || (s.total - 1) || ' more' ELSE '' END
  END, 200)
FROM summary s
WHERE c.id = s.conversation_id;

-- Done.
NOTIFY pgrst, 'reload schema';
