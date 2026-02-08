# RLM — Architecture

## Overview

RLM indexes repos and serves structural context packs to Claude Code. Zero LLM calls on the query path — TF-IDF keyword scoring, Voyage semantic boost, structural enrichment. ~150ms cold, ~10ms cached.

## System Architecture

```
Claude Code Session
  │ CLAUDE.md (auto-injected on register)
  │ Bash → rlm CLI
  ▼
rlm CLI (Node.js)
  Commands: context, index, status, repo, config, daemon
  │ HTTP
  ▼
Encore.ts Daemon (127.0.0.1:4000)
  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │  health   │  │   repo   │  │  index   │  │ context  │
  └──────────┘  └──────────┘  └──────────┘  └──────────┘
  ┌──────────┐
  │  patch   │
  └──────────┘

  Postgres + pgvector
  ┌───────┐ ┌───────┐ ┌──────────────┐ ┌──────────────┐
  │ repos │ │chunks │ │file_metadata │ │file_imports  │
  └───────┘ └───────┘ └──────────────┘ └──────────────┘
  ┌──────────┐ ┌──────────────┐ ┌────────┐
  │file_stats│ │file_cochanges│ │ traces │
  └──────────┘ └──────────────┘ └────────┘

  External API (optional)
  Voyage AI voyage-code-3 (embeddings + vocab clusters, 1024 dim)
```

## Services

| Service | Endpoint | Purpose |
| --- | --- | --- |
| health | `GET /health` | Liveness probe |
| repo | `/repo/*` | Register, list, remove, status |
| index | `/index/*` | Chunk indexing, file watcher, embed worker |
| context | `POST /context` | Structural context packs (main endpoint) |
| patch | `/patch/*` | Code patch operations |

## Data Flow

### Registration: `rlm repo register`

```
CLI → POST /repo/register
  1. Derive identity_key = SHA256(root_path + remote_url)
  2. UPSERT repos table
  3. Indexing pipeline:
     a. runIndex() — chunk files, diff-aware
     b. extractAndPersistMetadata() — regex exports/imports/docstrings
     c. buildVocabClusters() — Voyage-embed terms, cosine cluster >0.75
     d. buildAndPersistImportGraph() — directed import edges
     e. analyzeGitHistory() — file stats + co-change pairs
     f. startWatcher() — chokidar file watcher
  4. Inject CLAUDE.md into project
  5. Return repo_id
```

### Context: `rlm context "goal"`

```
CLI → POST /context { repo_id, goal }
  1. ensureIndexed() — diff scan if HEAD changed, skip if up-to-date
  2. Cache check — hit? return cached (10ms)
  3. Parallel load:
     - loadFileMetadata() — all file_metadata rows
     - getAllFileStats() — commit counts
     - vectorSearch() — Voyage semantic (if embeddings available)
     - loadVocabClusters() — repo-specific term clusters
  4. interpretQuery() — TF-IDF keyword scoring:
     - Expand keywords: static synonyms + vocab cluster terms
     - Filename token match: 4x * IDF weight
     - Directory token match: 2x * IDF weight
     - Export match: 2x * IDF weight
     - Docstring match: 1x * IDF weight
     - Quadratic coverage boost for multi-term matches
     - Noise penalty: vendor/, .min.js, drawable/, etc. → 0.3x
     - Activity boost: recent commits → up to +2.5
     - Cluster boost: cluster-matched files → 1.3x
  5. Semantic merge — vector results fill/replace weak keyword tail
  6. Structural enrichment (parallel):
     - getReverseImports() — "who imports this?"
     - getForwardImports() — "what does this import?"
     - get2HopReverseDeps() — importers of importers
     - getCochanges() — co-commit partners
  7. formatContextPack() → compact markdown
  8. Cache set (120s TTL, 20 entries)
```

Output format:
```
# {goal}

## Files
1. path — exports: ExportA, ExportB

## Dependency Graph
file.ts → imported.ts (imports)
file.ts ← importer.ts (imported by)
file.ts ←← 2-hop-importer.ts (2-hop)

## Co-change Clusters
[file.ts, other.ts, related.ts] — N co-commits

## Activity
file.ts: N commits, M/90d, last: Xd ago
```

~150ms cold, ~10ms cached. Zero LLM calls.

### Indexing Pipeline

```
runIndex(repoId) — index/lib/engine.ts
  1. Advisory lock (pg_advisory_lock)
  2. Discover files: fullScan or diffScan (git diff)
  3. Chunk files (~100 lines, 10 line overlap)
  4. Content-addressed: chunk_hash = SHA256(content + params)
  5. Unchanged chunks keep embeddings
  6. Strip null bytes (Postgres TEXT constraint)
  7. Structural analysis:
     a. extractAndPersistMetadata() — regex per language
     b. buildVocabClusters() — embed terms via Voyage, union-find clustering
     c. buildAndPersistImportGraph() — directed edges
     d. analyzeGitHistory() — git log → stats + co-changes
  8. Update repos state (last_indexed_commit, index_status)
```

### Vocab Clusters

Built at index time in `index/lib/vocab-clusters.ts`:

1. Extract unique vocabulary from exports + path segments
2. Split identifiers (camelCase/PascalCase → words), filter stopwords
3. Filter terms: must appear in 2+ files, not >30% of files
4. Embed via Voyage AI (batch size 128, ~2-3 API calls)
5. Pre-compute pairwise cosine similarity, filter >0.75 threshold
6. Union-find clustering, max 12 terms per cluster
7. Store as JSONB in `repos.vocab_clusters`
8. Fallback: if Voyage unavailable, skip silently → static synonyms used

### Metadata Extraction (regex, no LLM)

Per-language regex patterns extract:

| Data | TS/JS | C#/Java | Python | Go | Rust |
| --- | --- | --- | --- | --- | --- |
| Exports | export function/class/const | public class/interface/enum | def/class (top-level) | func Capitalized | pub fn/struct |
| Docstring | /\*\* ... \*/ | /// summary | \"\"\" ... \"\"\" | // Package | //! or /// |
| Imports | import from, require() | using, import | import, from import | import | use |

### Import Graph

Directed edges stored in `file_imports`:
- source_path → target_path (resolved from import specifiers)
- Enables reverse lookup: "who imports X?" for impact analysis
- 2-hop reverse deps: importers of importers for broader reach

### Git Analysis

Parses `git log --name-only --format="%H %aI" --no-merges -n 2000`:
- `file_stats`: commit_count, recent_count (90d), last_modified
- `file_cochanges`: file pairs co-occurring in commits (count >= 2)
- Skips commits with >20 files (mass refactors)
- Incremental via `repos.last_git_analysis_commit`

## Background Worker

Every 5 minutes:
1. Find repos with stale index or NULL embeddings
2. Advisory lock per repo
3. Re-index if HEAD changed
4. Embed chunks with NULL embedding (Voyage AI, batch 32)

## Embeddings

- Model: Voyage AI `voyage-code-3` (cloud API, 1024 dim)
- Lazy: only chunks where `embedding IS NULL`
- Optional: context degrades gracefully without embeddings (keyword-only, no semantic boost)
- Secret: `VoyageApiKey` via `encore secret set --type dev`

## File Watcher

- chokidar, in-memory per repo
- 500ms debounce, skips binary/node_modules/.git
- New chunks get `embedding = NULL` (worker picks them up)
- Lost on daemon restart — re-enable with `rlm repo watch`

## Storage

| Table | Key Columns | Purpose |
| --- | --- | --- |
| repos | id, root_path, vocab_clusters (JSONB) | Repo registry + cached clusters |
| chunks | repo_id, path, content, embedding (vector) | File content + Voyage embeddings |
| file_metadata | repo_id, path, exports, imports, docstring | Regex-extracted structure |
| file_imports | repo_id, source_path, target_path | Directed import graph |
| file_stats | repo_id, path, commit_count, recent_count | Git activity per file |
| file_cochanges | repo_id, path_a, path_b, cochange_count | Co-commit pairs |
| traces | repo_id, type, input, output | API call traces |

## Performance

| Operation | Latency | Notes |
| --- | --- | --- |
| `rlm context` (cold) | ~150ms | Keyword + semantic + structural |
| `rlm context` (cached) | ~10ms | In-memory cache hit |
| Registration (3k files) | ~30-50s | Full scan + vocab clusters + git analysis |
| Force re-index (3k files) | ~45-90s | Includes Voyage API calls for clusters |
