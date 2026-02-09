-- Repo index state
ALTER TABLE repos ADD COLUMN last_indexed_commit TEXT;
ALTER TABLE repos ADD COLUMN index_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE repos ADD COLUMN last_indexed_at TIMESTAMPTZ;

-- Chunks table
CREATE TABLE chunks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id             UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  path                TEXT NOT NULL,
  chunk_index         INT NOT NULL,
  start_line          INT NOT NULL,
  end_line            INT NOT NULL,
  content             TEXT NOT NULL,
  chunk_hash          TEXT NOT NULL,
  last_seen_commit    TEXT NOT NULL,
  language            TEXT,
  embedding           vector(1536),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(repo_id, path, chunk_index, chunk_hash)
);

CREATE INDEX idx_chunks_repo_path ON chunks(repo_id, path);
CREATE INDEX idx_chunks_repo ON chunks(repo_id);
CREATE INDEX idx_chunks_hash ON chunks(repo_id, chunk_hash);
CREATE INDEX idx_chunks_needs_embedding ON chunks(repo_id) WHERE embedding IS NULL;
