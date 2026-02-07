-- Switch from CodeRankEmbed (768 dim) to Voyage voyage-code-3 (1024 dim)
DROP INDEX IF EXISTS idx_chunks_embedding;
DROP INDEX IF EXISTS idx_chunks_needs_embedding;
ALTER TABLE chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE chunks ADD COLUMN embedding vector(1024);

CREATE INDEX idx_chunks_needs_embedding ON chunks(repo_id) WHERE embedding IS NULL;

CREATE INDEX idx_chunks_embedding ON chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
