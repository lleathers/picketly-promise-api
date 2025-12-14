-- Picketly Promise API
-- Initial schema migration (v1)
-- File: migrations/001_init.sql

BEGIN;

-- Optional but recommended: store UUID generation functions
-- (Render Postgres usually supports this; if it fails, remove and use BIGSERIAL everywhere.)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lowercase/normalize emails at ingestion time in the API.
-- This is here as a safety net if something slips through.
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- 2) Promises
-- status progression (current baseline):
--   pending_email_verification -> submitted
CREATE TABLE IF NOT EXISTS promises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  opportunity_key TEXT NOT NULL,

  -- Conservative: keep status flexible in early pilot
  status TEXT NOT NULL CHECK (status IN ('pending_email_verification', 'submitted', 'rejected', 'accepted', 'revoked')),

  -- JSON payload from ClickFunnels form (context, acknowledgement, etc.)
  payload JSONB NOT NULL,

  -- For future due diligence + internal review:
  reviewer_notes TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promises_user_id ON promises (user_id);
CREATE INDEX IF NOT EXISTS idx_promises_opportunity_key ON promises (opportunity_key);
CREATE INDEX IF NOT EXISTS idx_promises_status ON promises (status);
CREATE INDEX IF NOT EXISTS idx_promises_created_at ON promises (created_at);

-- Optional: prevent duplicate “submitted” promises for same user+opportunity
-- (If you want to allow multiple submissions, remove this.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_promises_user_opportunity_submitted
ON promises (user_id, opportunity_key)
WHERE status IN ('submitted', 'accepted');

-- 3) Artworks
-- Artwork tied to an opportunity key, with visibility rules.
-- Content can be either:
--  - image: content_url
--  - ascii: content_text
CREATE TABLE IF NOT EXISTS artworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who made it (optional in early phase if you only curate):
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,

  opportunity_key TEXT NOT NULL,

  -- 'image' or 'ascii' (baseline)
  type TEXT NOT NULL CHECK (type IN ('image', 'ascii')),

  title TEXT NULL,

  -- visibility rules:
  --  public: visible to everyone
  --  league: visible only to logged-in users
  --  private: visible only to owner (not yet enforced in code)
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'league', 'private')) DEFAULT 'public',

  content_url TEXT NULL,
  content_text TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Exactly one content field is required depending on type
  CONSTRAINT artworks_content_check CHECK (
    (type = 'image' AND content_url IS NOT NULL AND content_text IS NULL)
    OR
    (type = 'ascii' AND content_text IS NOT NULL AND content_url IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_artworks_opportunity_key ON artworks (opportunity_key);
CREATE INDEX IF NOT EXISTS idx_artworks_visibility ON artworks (visibility);
CREATE INDEX IF NOT EXISTS idx_artworks_created_at ON artworks (created_at);
CREATE INDEX IF NOT EXISTS idx_artworks_user_id ON artworks (user_id);

-- 4) updated_at trigger helper (optional but nice)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_promises_updated_at ON promises;
CREATE TRIGGER trg_promises_updated_at
BEFORE UPDATE ON promises
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;

