-- ============================================================
-- COLVY V154 — STORAGE BUCKETS
-- Creates every storage bucket the app writes to. Missing buckets are
-- why uploads failed with "Bucket not found". Safe to re-run.
-- ============================================================

-- Public buckets (files get a public URL that the widget/admin can render).
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('chat-attachments', 'chat-attachments', true),
  ('idea-images',      'idea-images',      true),
  ('media-gallery',    'media-gallery',    true),
  ('media-requests',   'media-requests',   true),
  ('documents',        'documents',        true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Permissive policies so the app (anon key + service role) can read/write.
-- Tighten these later if you move to per-user storage rules.
DO $$
DECLARE b TEXT;
BEGIN
  FOREACH b IN ARRAY ARRAY['chat-attachments','idea-images','media-gallery','media-requests','documents']
  LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS "colvy_read_%1$s" ON storage.objects;
      CREATE POLICY "colvy_read_%1$s" ON storage.objects
        FOR SELECT USING (bucket_id = %1$L);

      DROP POLICY IF EXISTS "colvy_insert_%1$s" ON storage.objects;
      CREATE POLICY "colvy_insert_%1$s" ON storage.objects
        FOR INSERT WITH CHECK (bucket_id = %1$L);

      DROP POLICY IF EXISTS "colvy_update_%1$s" ON storage.objects;
      CREATE POLICY "colvy_update_%1$s" ON storage.objects
        FOR UPDATE USING (bucket_id = %1$L);

      DROP POLICY IF EXISTS "colvy_delete_%1$s" ON storage.objects;
      CREATE POLICY "colvy_delete_%1$s" ON storage.objects
        FOR DELETE USING (bucket_id = %1$L);
    $f$, b);
  END LOOP;
END $$;

-- Verify: SELECT id, public FROM storage.buckets;
