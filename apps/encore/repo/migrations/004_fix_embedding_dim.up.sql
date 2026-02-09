-- Switch embedding dimension from 1536 to 384 (bge-small-en-v1.5)
DROP INDEX IF EXISTS idx_chunks_embedding;
ALTER TABLE chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE chunks ADD COLUMN embedding vector(384);

CREATE INDEX idx_chunks_needs_embedding ON chunks(repo_id) WHERE embedding IS NULL;
CREATE INDEX idx_chunks_embedding ON chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
