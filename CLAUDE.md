# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## LENS — Local-First Repo Context Engine

Indexes codebases and serves context packs to AI agents. Zero LLM calls on the query path.

### Monorepo Structure (pnpm workspaces)

```
apps/
  encore/       ← current working Encore app (Postgres, Docker)
  daemon/       ← Layer 2: local HTTP + MCP server (planned)
  cloud/        ← Layer 3: control plane, billing (planned)
packages/
  cli/          ← CLI tool (`lens` command)
  engine/       ← Layer 1: core logic, SQLite (planned)
  types/        ← shared types (planned)
docs/           ← architecture, benchmarks
```

### Development Commands

**Install**: `pnpm install` (from root)

**Encore daemon**: `cd apps/encore && encore run` (binds `127.0.0.1:4000`)

**CLI build**: `pnpm --filter @lens/cli build`

**Build all**: `pnpm -r build`

**Testing**: `encore test` (with infra) or `vitest` (without)

**Restart required after**: SQL migrations, service code changes

### Key Implementation Notes

**Migrations**: No hot-reload. Restart `encore run`. Numbered format: `001_name.up.sql` in `apps/encore/repo/migrations/`

**Database**: `apps/encore/repo/db.ts` exports named `db` — DB resources cannot be default-exported

**Secrets**: `encore secret set --type dev <key>` (dev type, not local). `VoyageApiKey` for embeddings + vocab clusters. `OpenRouterApiKey` for purpose summaries

**Model config**: All model names, API URLs, batch sizes, secrets in `apps/encore/index/lib/models.ts` (single source of truth)

**Advisory locks**: `apps/encore/repo/lib/identity.ts` hashes UUID to 32-bit int for `pg_advisory_lock`

**File watchers**: In-memory per repo — stop on daemon restart, re-enable with `lens repo watch`

### Context Pack Pipeline

`POST /context { repo_id, goal }` → ~0.5-7s cold, ~10ms cached:

1. **Auto-index** — diff scan if HEAD changed, skip if up-to-date
2. **TF-IDF keyword scoring** — code-domain stopwords, segment-aware path tokens (filename 4x, dir 2x) + exports + docstrings + purpose summaries. Indegree boost for hub files, sibling dedup (max 2/group), dynamic cap (8-15 based on import depth)
3. **Concept expansion** — static synonyms (always) + repo-specific vocab clusters (when Voyage available)
4. **Co-change promotion** — direct partners of top-5 keyword files + cluster-based promotion
5. **Semantic boost** — Voyage vector search merges top chunks (when embeddings available)
6. **Structural enrichment** — forward/reverse imports, 2-hop deps, co-change clusters, git activity
7. **Cache** — keyed by (repo_id, goal, commit), 120s TTL, 20 entries

### Indexing Pipeline

`runIndex()` in `apps/encore/index/lib/engine.ts`:

1. Diff scan (or full scan if forced) → chunk files
2. `extractAndPersistMetadata()` — exports, imports, docstrings per file
3. `buildVocabClusters()` — Voyage-embed unique terms, cosine cluster >0.75, store as JSONB
4. `buildAndPersistImportGraph()` — directed import edges
5. `computeMaxImportDepth()` — BFS from leaves, determines dynamic file cap
6. `analyzeGitHistory()` — commit counts, co-change pairs

### Voyage AI Integration

- Model: `voyage-code-3` (1024 dim)
- Embedder: `apps/encore/index/lib/embedder.ts` — batch size 32 for chunks, 128 for vocab terms
- Vocab clusters: `apps/encore/index/lib/vocab-clusters.ts` — union-find clustering, max 12 terms/cluster
- Lazy embedding: background worker embeds chunks where `embedding IS NULL`
- Graceful fallback: if `VoyageApiKey` not set, clusters skipped, static synonyms used

### Query Interpreter

`apps/encore/context/lib/query-interpreter.ts`:

- Stopwords: natural language + 30 code-domain terms (index, data, value, module, etc.)
- Noise filtering: vendor/, scripts/, .min.js, .designer.cs, drawable/, layout/ etc.
- Path scoring: tokenized segments (camelCase/snake_case split), not substring match
- Static `CONCEPT_SYNONYMS`: error→interceptor/middleware, auth→token/guard, etc.
- Vocab cluster expansion: adds cluster terms + 1.3x boost for cluster-matched files
- TF-IDF weighting: rare terms score higher than common ones
- Quadratic coverage boost: files matching multiple query terms rank higher
- Indegree boost: hub files (imported by 3+) get log2-scaled bonus
- Sibling dedup: max 2 files per directory/name-prefix group
- Dynamic file cap: min(max(8, importDepth * 2 + 4), 15)
