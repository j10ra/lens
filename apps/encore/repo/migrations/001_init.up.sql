CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE repos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_key  TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  root_path     TEXT NOT NULL,
  remote_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_repos_identity ON repos(identity_key);
