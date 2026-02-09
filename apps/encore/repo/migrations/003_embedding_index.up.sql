-- IVFFlat index for cosine similarity search on chunk embeddings.
-- Tuning: lists ~ sqrt(chunk_count), probes ~ sqrt(lists).
-- After bulk embedding, run: ANALYZE chunks;
CREATE INDEX idx_chunks_embedding ON chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
