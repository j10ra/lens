# RLM — Architecture

## Overview

RLM indexes repos and serves structural context to Claude Code. Zero LLM calls on the query path — pure retrieval with regex-extracted metadata, import graph, and git analysis.

## System Architecture

```
Claude Code Session
  │ CLAUDE.md (auto-injected on register)
  │ Bash → rlm CLI
  ▼
rlm CLI (Node.js)
  Commands: context, search, read, run, status, repo
  │ HTTP
  ▼
Encore.ts Daemon (127.0.0.1:4000)
  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │  health   │  │   repo   │  │  index   │  │  search  │
  └──────────┘  └──────────┘  └──────────┘  └──────────┘
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ context  │  │  runner  │  │   read   │
  └──────────┘  └──────────┘  └──────────┘

  Postgres + pgvector
  ┌───────┐ ┌───────┐ ┌──────────────┐ ┌──────────────┐
  │ repos │ │chunks │ │file_metadata │ │file_imports  │
  └───────┘ └───────┘ └──────────────┘ └──────────────┘
  ┌──────────┐ ┌──────────────┐ ┌────────┐
  │file_stats│ │file_cochanges│ │ traces │
  └──────────┘ └──────────────┘ └────────┘

  External API (optional)
  Voyage AI voyage-code-3 (embeddings, 1024 dim)
```

## Services

| Service | Endpoint | Purpose |
| --- | --- | --- |
| health | GET /health | Health check |
| repo | /repo/* | Register, list, remove, status, watch |
| index | /index/* | Chunk indexing, watch, embed worker |
| context | POST /context, /task | Structural context packs |
| search | POST /search | Hybrid grep + semantic search |
| read | POST /read | File content retrieval |
| runner | POST /run | Sandboxed command execution |

## Data Flow

### Registration: `rlm repo register`

```
CLI → POST /repo/register
  1. Derive identity_key = SHA256(root_path + remote_url)
  2. UPSERT repos table
  3. Fire-and-forget pipeline:
     a. runIndex() — chunk files, diff-aware
     b. extractAndPersistMetadata() — regex exports/imports/docstrings
     c. buildAndPersistImportGraph() — directed import edges
     d. analyzeGitHistory() — file stats + co-change pairs
     e. startWatcher() — chokidar file watcher
  4. Inject CLAUDE.md into project
  5. Return repo_id
```

### Context: `rlm context "goal"`

```
CLI → POST /context { repo_id, goal }
  1. ensureIndexed() — reindex if stale
  2. loadFileMetadata() — all file_metadata rows
  3. getFileStats() — commit counts for activity boost
  4. interpretQuery() — keyword scoring against metadata
     - Path match: 3 pts
     - Export match: 2 pts
     - Docstring match: 1 pt
     - Activity boost: up to 2.5 pts
  5. getReverseImports() — "who imports this?"
  6. getCochanges() — "what changes with this?"
  7. getFileStats() — commit frequency
  8. formatContextPack() → compact markdown
```

Output format:
```
# {goal}

## Where to Look
1. path — reason (from exports/docstring)

## Impact
file.ts <- importer1.ts, importer2.ts

## History
file.ts: N commits/90d, co-changes: other.ts (Mx)

## Tools
rlm search "<query>" | rlm read <path> | rlm run "<cmd>"
```

~240ms, zero LLM calls.

### Search: `rlm search "query"`

```
CLI → POST /search { repo_id, query, mode }
  1. ensureIndexed()
  2. Resolve mode (grep | semantic | hybrid)
  3. Grep: ILIKE on chunks.content
  4. Semantic: Voyage AI embed query → cosine similarity (if embeddings available)
  5. Hybrid: grep first, skip semantic if grep is precise (≤5 hits, high score)
  6. Merge + rerank
  7. Return results[]
```

### Indexing Pipeline

```
runIndex(repoId)
  1. Advisory lock (pg_advisory_lock)
  2. Discover files: fullScan or diffScan (git diff)
  3. Chunk files (~100 lines, 10 line overlap)
  4. Content-addressed: chunk_hash = SHA256(content + params)
  5. Unchanged chunks keep embeddings
  6. Structural analysis:
     a. extractAndPersistMetadata() — regex per language
     b. buildAndPersistImportGraph() — directed edges
     c. analyzeGitHistory() — git log → stats + co-changes
  7. Update repos state
```

### Metadata Extraction (regex, no LLM)

Per-language regex patterns extract:

| Data | TS/JS | C#/Java | Python | Go | Rust |
| --- | --- | --- | --- | --- | --- |
| Exports | export function/class/const | public class/interface/enum | def/class (top-level) | func Capitalized | pub fn/struct |
| Docstring | /** ... */ | /// summary | \"\"\" ... \"\"\" | // Package | //! or /// |
| Imports | import from, require() | using, import | import, from import | import | use |

### Import Graph

Directed edges stored in `file_imports`:
- source_path → target_path (resolved from import specifiers)
- Enables reverse lookup: "who imports X?" for impact analysis

### Git Analysis

Parses `git log --name-only --format="%H %aI" --no-merges -n 2000`:
- `file_stats`: commit_count, recent_count (90d), last_modified
- `file_cochanges`: file pairs co-occurring in commits (count ≥ 2)
- Skips commits with >20 files (mass refactors)
- Incremental via `repos.last_git_analysis_commit`

## Background Worker

Every 5 minutes:
1. Find repos with stale index or NULL embeddings
2. Advisory lock per repo
3. Re-index if HEAD changed
4. Embed chunks with NULL embedding (Voyage AI, batch 128)

## Embeddings

- Model: Voyage AI `voyage-code-3` (cloud API, 1024 dim)
- Lazy: only chunks where `embedding IS NULL`
- Optional: search degrades to grep-only without embeddings
- Secret: `VoyageApiKey` via `encore secret set --type dev`

## File Watcher

- chokidar, in-memory per repo
- 500ms debounce, skips binary/node_modules/.git
- New chunks get `embedding = NULL` (worker picks them up)
- Lost on daemon restart — re-enable with `rlm repo watch`

## Storage

| Table | Per-Row Size | 10k files (~80k chunks) |
| --- | --- | --- |
| chunks | ~2KB (content + metadata) | ~160MB |
| embeddings | 4KB (1024-dim float) | ~320MB |
| file_metadata | ~200B | ~2MB |
| file_imports | ~100B | ~1MB |
| file_stats | ~50B | ~500KB |
| file_cochanges | ~50B | ~500KB |
| traces | ~500B | ~5MB |

## Performance

| Operation | Latency | Notes |
| --- | --- | --- |
| `rlm context` (cached) | ~240ms | Keyword match + structural enrichment |
| `rlm search` | 200-500ms | Hybrid grep + semantic |
| `rlm read` | 10-50ms | Disk read |
| `rlm run` | command time | ~5ms overhead |
| Registration | ~30s | Full scan + structural analysis |
