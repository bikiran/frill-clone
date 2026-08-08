-- ============================================================
-- COLVY V242 — PER-USER GALLERY FAVOURITES
-- Each teammate keeps their own set of favourited media (the ❤ on a gallery
-- image/video). Not shared — one row per (user, media). Additive, safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS media_favorites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid,
  user_id     uuid NOT NULL,
  media_id    uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, media_id)
);

CREATE INDEX IF NOT EXISTS media_favorites_user_idx ON media_favorites (user_id, company_id);

NOTIFY pgrst, 'reload schema';
