BEGIN;

ALTER TABLE artworks
  ADD COLUMN IF NOT EXISTS exhibited_by TEXT
    CHECK (exhibited_by IN ('seller','promise_maker'));

ALTER TABLE artworks
  ADD COLUMN IF NOT EXISTS exhibit_status TEXT
    CHECK (exhibit_status IN ('draft','accepted','acknowledged'));

-- Safety default: nothing is seller-exhibited unless explicitly marked
UPDATE artworks
SET exhibited_by = 'promise_maker',
    exhibit_status = 'draft'
WHERE exhibited_by IS NULL;

COMMIT;