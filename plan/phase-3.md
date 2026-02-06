# Phase 3 — Embeddings + Vector Search

**Goal:** Store embeddings via pgvector. Semantic retrieval finds relevant code even without exact keyword matches. Embedding is on-demand and chunk_hash-aware — no redundant work.

**Status:** [ ] Pending

**Depends on:** Phase 2

---

## Embedding Tracking Strategy

Embeddings ride on the same `chunk_hash` key from Phase 2.

- Chunk row already has `embedding vector(1536)` column (added in Phase 2 migration, NULL by default)
- A chunk needs embedding when `embedding IS NULL`
- If `chunk_hash` didn't change → chunk row persists → embedding persists → skip
- If `chunk_hash` changed → old chunk row deleted, new one inserted (NULL embedding) → needs embedding
- On commit advance → only new/changed chunks get embedded (because only they have NULL embeddings)
- **No separate tracking table** — the chunk row IS the source of truth

```
chunk_hash unchanged → chunk row kept    → embedding kept     → skip
chunk_hash changed   → old row deleted   → new row (NULL emb) → embed
new file             → new rows          → NULL embedding     → embed
deleted file         → rows deleted      → embeddings gone    → skip
```

---

## Tasks

### 3.1 — Lock embedding model + pgvector index
- [ ] **Lock embedding model for MVP** — decide once, enforce everywhere:
  - Model: Z.ai text-embedding (or OpenAI `text-embedding-3-small`) — 1536 dimensions
  - Store model name in config constant: `EMBEDDING_MODEL` + `EMBEDDING_DIM = 1536`
  - Validate dimension at write time: reject vectors with wrong length
- [ ] Migration `003_embedding_index.up.sql`:
  ```sql
  -- IVFFlat index for cosine similarity search
  CREATE INDEX idx_chunks_embedding ON chunks
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
  ```
- [ ] The `embedding vector(1536)` column already exists from `002_chunks.up.sql`
- [ ] IVFFlat tuning notes:
  - After bulk embedding: run `ANALYZE chunks;` to update index statistics
  - Set `SET ivfflat.probes = 10;` (session-level) for quality — higher = slower but better recall
  - Rule of thumb: `lists` ~ `sqrt(chunk_count)`, `probes` ~ `sqrt(lists)`
  - Re-evaluate for HNSW when chunk_count > 100k

### 3.2 — Embedding provider abstraction
- [ ] Create `apps/rlm/search/embedder.ts`
- [ ] Interface:
  ```ts
  interface Embedder {
    embed(texts: string[]): Promise<number[][]>
    readonly dimensions: number
  }
  ```
- [ ] Implementation: Z.ai embeddings endpoint (OpenAI-compatible API)
- [ ] Batch: up to 100 chunks per API call
- [ ] Rate limiting + exponential backoff retry
- [ ] Config: `RLM_EMBED_API_URL`, `RLM_EMBED_API_KEY`, `RLM_EMBED_MODEL`
- [ ] Validate: `embed()` output length must equal `EMBEDDING_DIM` — throw if mismatch

### 3.3 — Lazy embedding pipeline
- [ ] Create `apps/rlm/index/embed.ts`
- [ ] `ensureEmbedded(repo_id)` — called after `ensureIndexed()`:
  ```
  1. SELECT id, content FROM chunks
     WHERE repo_id = $1 AND embedding IS NULL
  2. If count == 0 → return (no-op)
  3. Batch embed (100 at a time)
  4. UPDATE chunks SET embedding = $vec WHERE id = $id
  5. After batch: run ANALYZE chunks (if > 100 new embeddings)
  6. Return { embedded_count, skipped_count, duration_ms }
  ```
- [ ] Integrates into the `rlm task` / `rlm search` flow:
  ```
  rlm task "..."
    → ensureIndexed(repo_id)     # Phase 2: diff-aware chunk upsert
    → ensureEmbedded(repo_id)    # Phase 3: embed only NULL chunks
    → build context / search
  ```
- [ ] Progress tracking: log batches processed for long-running embeds

### 3.4 — Hybrid search endpoint
- [ ] Create `apps/rlm/search/search.ts`
- [ ] `POST /search` endpoint (replace Phase 2 grep stub):
  - Input: `{ repo_id, query, limit?, mode? }`
  - Calls `ensureIndexed()` + `ensureEmbedded()` first
  - Modes:
    - `"grep"` — text search only (ILIKE on chunks.content)
    - `"semantic"` — vector search only (cosine similarity)
    - `"hybrid"` (default) — both, merged + reranked
  - Hybrid pipeline:
    1. Grep: `content ILIKE '%query%'` → scored by match density
    2. Embed query string → cosine similarity top-k via pgvector
    3. Merge: deduplicate by chunk_id
    4. Rerank: `grep_score * 0.3 + semantic_score * 0.7`
    5. Return top-k (default 10)
  - Response: `Array<{ path, start_line, end_line, snippet, score, match_type }>`

### 3.5 — Graceful degradation
- [ ] If no chunks have embeddings yet → fall back to grep-only silently
- [ ] If embedding API is unreachable → search works (grep mode), warn in response
- [ ] `ensureEmbedded()` failure should NOT block `rlm task` — context pack still works with grep results
- [ ] Response includes `{ search_mode_used: "hybrid" | "grep" | "semantic" }` so caller knows

### 3.6 — Search result enrichment
- [ ] For each result, include +-5 lines of surrounding context
- [ ] Group results by file path
- [ ] Include file language for syntax highlighting hints

### 3.7 — Update CLI search command
- [ ] `rlm search "<query>"` uses hybrid mode by default
- [ ] `--mode grep|semantic|hybrid` flag
- [ ] `--limit N` flag (default 10)
- [ ] Output: grouped by file, with line numbers and snippets
- [ ] Shows `(semantic)` or `(grep)` badge per result

### 3.8 — Performance tuning
- [ ] Benchmark on a large repo (1000+ files)
- [ ] Tune IVFFlat `lists` parameter based on chunk count
- [ ] Query embedding cache: same query string within 5min → reuse vector
- [ ] Target: < 500ms for hybrid search on 50k chunks

---

## Exit Criteria

- [ ] `rlm search "handle authentication"` finds auth-related code (semantic match)
- [ ] `rlm search "TODO"` finds exact matches (grep)
- [ ] Hybrid returns better results than either mode alone
- [ ] `rlm task "..."` on a fresh repo → auto-indexes + auto-embeds → works
- [ ] Second `rlm task` on unchanged repo → 0 embeddings generated (all cached)
- [ ] Commit a change → `rlm task` → only new chunks get embedded
- [ ] Embedding API down → search still works via grep fallback
- [ ] Search latency < 1s on repos with 10k+ chunks

---

## Architecture Notes

```
apps/rlm/search/
├── search.ts           # POST /search — hybrid search endpoint
├── embedder.ts         # Embedding provider abstraction
├── grep.ts             # Text-based search (ILIKE)
├── vector.ts           # pgvector cosine similarity search
└── rerank.ts           # Score merging + reranking

apps/rlm/index/
├── embed.ts            # ensureEmbedded() — lazy embedding pipeline
└── (existing files from Phase 2)
```

### Full on-demand flow

```
rlm task "add rate limiting"
     │
     ▼
ensureIndexed(repo_id)          ← Phase 2
  │
  ├── HEAD == last_indexed? → skip
  └── HEAD changed? → diff-index changed files only
       │
       ▼
     New chunks have embedding = NULL
     Old unchanged chunks keep their embeddings
     │
     ▼
ensureEmbedded(repo_id)         ← Phase 3
  │
  ├── SELECT WHERE embedding IS NULL
  ├── count == 0? → skip (all cached) ✓
  └── count > 0?  → batch embed only those
       │
       ▼
     UPDATE chunks SET embedding = $vec
     │
     ▼
Search / Context Pack (uses embeddings)
```

### Why no separate embeddings table

The chunk row IS the embedding record. Benefits:
- Single source of truth: chunk_hash guards both content and embedding freshness
- CASCADE delete: remove a chunk → embedding gone
- No join overhead on search queries
- NULL check = "needs embedding" — no state sync needed
