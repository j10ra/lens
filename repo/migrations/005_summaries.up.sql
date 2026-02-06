CREATE TABLE summaries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id       UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  path          TEXT NOT NULL,
  level         TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  summary       TEXT NOT NULL,
  key_exports   JSONB,
  dependencies  JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(repo_id, path, level, content_hash)
);

CREATE INDEX idx_summaries_repo_path ON summaries(repo_id, path);
