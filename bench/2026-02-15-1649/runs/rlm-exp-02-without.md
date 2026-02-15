Now I have a complete picture. Let me compile the findings.

## Repository Indexing Pipeline

### Core Indexing (`runIndex` in `packages/engine/src/index/engine.ts`)

**Always runs on every index trigger.** Sequential stages:

1. **Discovery** (lines 64-71)
   - Diff scan (changed files since last commit) OR full scan (`--force` or first run)
   - Returns list of `{ path, status, language }` files

2. **Chunking** (lines 73-148)
   - For each discovered file: read content, split into chunks via `chunkFile()`
   - Upsert new/changed chunks to `chunks` table (max 100k per repo)
   - Delete orphaned chunks (files removed from git)
   - Prune stale paths on full scan

3. **Metadata Extraction** (lines 151-163)
   - `extractAndPersistMetadata()` extracts per-file: exports, imports, docstrings, sections, internals
   - Upserts to `file_metadata` table
   - Prunes orphan metadata on full scan

4. **Import Graph** (lines 166-169)
   - `buildAndPersistImportGraph()` builds directed edges `source_path → target_path`
   - `computeMaxImportDepth()` — BFS from leaf nodes, stores max depth per repo

5. **Git Analysis** (lines 172-175)
   - `analyzeGitHistory()` — parses last 2000 commits (non-merge)
   - Stores per-file: commit count, recent count (90 days), last modified
   - Builds co-change pairs (files that change together ≥2 times)

---

### Enrichment (Post-Index, Background)

**Only runs on explicit triggers** (`lens repo register`, `lens index`, `POST /repo/register`, `POST /index/run`). Guarded by per-repo toggles + quota checks.

1. **Vocab Clusters** (`buildVocabClusters` in `vocab-clusters.ts`)
   - Extracts terms from paths + exports (stopwords filtered, TF-IDF capped)
   - Embeds up to 1500 terms via Voyage API (batches of 32)
   - Agglomerative clustering with cosine >0.75 threshold
   - Stores up to 200 clusters (max 12 terms each) in `repos.vocab_clusters` JSON

2. **Embeddings** (`ensureEmbedded` in `embed.ts`)
   - Finds unembedded chunks in `chunks` table
   - Batches via Voyage API (max 100k tokens per batch, 32 chunks per pool)
   - Max 2000 API calls per run
   - Stores vectors in `chunks.embedding` BLOB

3. **Purpose Summaries** (`enrichPurpose` in `enrich-purpose.ts`)
   - LLM-generated one-line file purpose from path + first chunk + exports + docstring
   - Batch of 200 candidates, concurrency 10
   - Stores in `file_metadata.purpose`

---

### Trigger Matrix

| Trigger | Core Index | Enrichment | Notes |
|---------|------------|------------|-------|
| `POST /repo/register` | full scan | **yes** | First registration |
| `POST /index/run` | diff scan (or full `--force`) | **yes** | Manual reindex |
| `POST /context` | diff scan via `ensureIndexed()` | **no** | Auto-index if stale, but no API calls |
| File watcher (chokidar) | incremental chunk update only | **no** | Just upserts/deletes chunks, no metadata/graph/git |

---

### Key Design Points

- **Enrichment = expensive**: Voyage embeddings + LLM calls cost money. Only explicit user actions trigger it.
- **Context endpoint is fast**: Auto-indexes stale repos but skips enrichment entirely.
- **File watcher is lightweight**: Only updates chunks in-place; doesn't rebuild metadata, import graph, or co-changes.
- **Idempotent checks**: Vocab clusters skip if `last_vocab_cluster_commit === last_indexed_commit`; embeddings skip already-embedded chunks; purpose skips if hash matches.

## Report

- **Tool calls**: 7
- **Files read**: 7
- **Key findings**:
  - Core index has 5 stages: discovery → chunking → metadata → import graph → git analysis
  - Enrichment has 3 stages: vocab clusters, embeddings, purpose summaries — all require API capabilities
  - Context endpoint auto-indexes but deliberately skips enrichment for speed
  - File watcher only updates chunks incrementally, no structural analysis
