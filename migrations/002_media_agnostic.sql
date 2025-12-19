BEGIN;

-- 1) Add a media-agnostic content payload
ALTER TABLE artworks
  ADD COLUMN IF NOT EXISTS content_json JSONB NULL;

-- 2) Allow future media without breaking existing code
-- Drop the old constraint that forces (image->url) or (ascii->text)
ALTER TABLE artworks
  DROP CONSTRAINT IF EXISTS artworks_content_check;

-- 3) Replace with: exactly ONE of url/text/json must be present
ALTER TABLE artworks
  ADD CONSTRAINT artworks_content_any_check CHECK (
    (CASE WHEN content_url  IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN content_text IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN content_json IS NOT NULL THEN 1 ELSE 0 END)
    = 1
  );

-- 4) Expand type without forcing you to refactor immediately
-- (keeps image/ascii working; adds 'json' for media-agnostic representations)
ALTER TABLE artworks
  DROP CONSTRAINT IF EXISTS artworks_type_check;

ALTER TABLE artworks
  ADD CONSTRAINT artworks_type_check CHECK (type IN ('image', 'ascii', 'json'));

COMMIT;

