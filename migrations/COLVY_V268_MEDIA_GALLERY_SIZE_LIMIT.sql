-- ============================================================
-- COLVY V268 — MEDIA GALLERY FILE-SIZE LIMIT
-- Phone uploads (the QR "Upload from your phone" flow) were rejecting videos
-- with "Upload failed (400)" / a dropped connection. The media-gallery bucket
-- was created (V154) without a file_size_limit, so it fell back to the project
-- default (50 MB) — which a single phone video blows past instantly.
--
-- Raise the per-bucket ceiling to 5 GB and leave mime types open so any
-- photo/video the phone offers is accepted.
--
-- NOTE: a bucket limit can never exceed the PROJECT-WIDE upload limit. If large
-- videos still fail after this runs, raise it in the Supabase dashboard under
-- Storage → Settings → "Upload file size limit" too.
-- Safe to re-run.
-- ============================================================

UPDATE storage.buckets
SET
  file_size_limit = 5368709120,   -- 5 GB
  allowed_mime_types = NULL        -- accept any type
WHERE id = 'media-gallery';

-- Verify: SELECT id, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'media-gallery';
