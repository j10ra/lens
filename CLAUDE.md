# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## RLM — Repo Context Daemon

Local daemon that indexes codebases and serves context packs to Claude Code. Zero LLM calls on the query path.

### Architecture

- **Services**: `health/`, `repo/`, `index/`, `context/`, `patch/` (Encore.ts, flat structure at repo root)
- **CLI**: `packages/rlm-cli/` (TypeScript, compiled to `dist/`)
- **Database**: Postgres via Encore (Docker), single `rlm` database
- **Only endpoint**: `POST /context` — everything else is internal

### Development Commands

**Daemon**: `encore run` (binds to `127.0.0.1:4000`, NOT localhost)

**CLI**: `cd packages/rlm-cli && npm run build`

**Testing**: `encore test` (with infra) or `vitest` (without)

**Restart required after**: SQL migrations, service code changes

### Key Implementation Notes

**Migrations**: No hot-reload. Restart `encore run`. Numbered format: `001_name.up.sql` in `repo/migrations/`

**Database**: `repo/db.ts` exports named `db` — DB resources cannot be default-exported

**Secrets**: `encore secret set --type dev <key>` (dev type, not local). `VoyageApiKey` for embeddings + vocab clusters. `OpenRouterApiKey` for purpose summaries

**Model config**: All model names, API URLs, batch sizes, secrets in `index/lib/models.ts` (single source of truth)

**Advisory locks**: `repo/lib/identity.ts` hashes UUID to 32-bit int for `pg_advisory_lock`

**File watchers**: In-memory per repo — stop on daemon restart, re-enable with `rlm repo watch`

### Context Pack Pipeline

`POST /context { repo_id, goal }` → ~150ms cold, ~10ms cached:

1. **Auto-index** — diff scan if HEAD changed, skip if up-to-date
2. **TF-IDF keyword scoring** — segment-aware path tokens (filename 4x, dir 2x) + exports + docstrings
3. **Concept expansion** — static synonyms (always) + repo-specific vocab clusters (when Voyage available)
4. **Semantic boost** — Voyage vector search merges top chunks (when embeddings available)
5. **Structural enrichment** — forward/reverse imports, 2-hop deps, co-change clusters, git activity
6. **Cache** — keyed by (repo_id, goal, commit), 120s TTL, 20 entries

### Indexing Pipeline

`runIndex()` in `index/lib/engine.ts`:

1. Diff scan (or full scan if forced) → chunk files
2. `extractAndPersistMetadata()` — exports, imports, docstrings per file
3. `buildVocabClusters()` — Voyage-embed unique terms, cosine cluster >0.75, store as JSONB
4. `buildAndPersistImportGraph()` — directed import edges
5. `analyzeGitHistory()` — commit counts, co-change pairs

### Voyage AI Integration

- Model: `voyage-code-3` (1024 dim)
- Embedder: `index/lib/embedder.ts` — batch size 32 for chunks, 128 for vocab terms
- Vocab clusters: `index/lib/vocab-clusters.ts` — union-find clustering, max 12 terms/cluster
- Lazy embedding: background worker embeds chunks where `embedding IS NULL`
- Graceful fallback: if `VoyageApiKey` not set, clusters skipped, static synonyms used

### Query Interpreter

`context/lib/query-interpreter.ts`:

- Noise filtering: vendor/, scripts/, .min.js, .designer.cs, drawable/, layout/ etc.
- Path scoring: tokenized segments (camelCase/snake_case split), not substring match
- Static `CONCEPT_SYNONYMS`: error→interceptor/middleware, auth→token/guard, etc.
- Vocab cluster expansion: adds cluster terms + 1.3x boost for cluster-matched files
- TF-IDF weighting: rare terms score higher than common ones
- Quadratic coverage boost: files matching multiple query terms rank higher
