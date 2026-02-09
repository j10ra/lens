CREATE TABLE file_metadata (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id     UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  language    TEXT,
  exports     JSONB DEFAULT '[]',
  imports     JSONB DEFAULT '[]',
  docstring   TEXT DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(repo_id, path)
);
CREATE INDEX idx_file_metadata_repo ON file_metadata(repo_id);
