# RLM — Architecture

## Overview

RLM indexes repos and serves structural context packs to Claude Code. TF-IDF keyword scoring, Voyage semantic boost, OpenRouter file summaries, structural enrichment. ~150ms cold, ~10ms cached.

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

  Postgres + pgvector
  ┌───────┐ ┌───────┐ ┌──────────────┐ ┌──────────────┐
  │ repos │ │chunks │ │file_metadata │ │file_imports  │
  └───────┘ └───────┘ └──────────────┘ └──────────────┘
  ┌──────────┐ ┌──────────────┐
  │file_stats│ │file_cochanges│
  └──────────┘ └──────────────┘

  External APIs (optional)
  Voyage AI voyage-code-3 (embeddings + vocab clusters, 1024 dim)
  OpenRouter (purpose summaries, configurable model)
```

## Services

| Service | Endpoint | Purpose |
| --- | --- | --- |
| health | `GET /health` | Liveness probe |
| repo | `/repo/*` | Register, list, remove, status |
| index | `/index/*` | Chunk indexing, file watcher, embed worker |
| context | `POST /context` | Structural context packs (main endpoint) |

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
  4. Post-index (parallel, fire-and-forget):
     a. ensureEmbedded() — Voyage API vector embeddings
     b. enrichPurpose(fullRun=true) — OpenRouter file summaries (loops until done)
  5. Inject CLAUDE.md into project
  6. Return repo_id
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
     - Filter stopwords: natural language + 30 code-domain terms (index, data, value, etc.)
     - Expand keywords: static synonyms + vocab cluster terms
     - Filename token match: 4x * IDF weight
     - Directory token match: 2x * IDF weight
     - Export match: 2x * IDF weight
     - Docstring/purpose match: 1x * IDF weight (additive, both contribute)
     - Quadratic coverage boost for multi-term matches
     - Noise penalty: vendor/, .min.js, drawable/, etc. → 0.3x
     - Activity boost: recent commits → up to +2.5
     - Cluster boost: cluster-matched files → 1.3x
     - Indegree boost: files imported by 3+ others → *(1 + log2(deg) * 0.1)
     - Sibling dedup: max 2 files per directory/name-prefix group
     - Dynamic cap: min(max(8, importDepth * 2 + 4), 15) based on repo complexity
  5. Co-change promotion — direct partners of top-5 keyword files (up to 3)
  6. Semantic merge — vector results fill/replace weak keyword tail (up to 5)
  7. Structural enrichment (parallel):
     - getReverseImports() — "who imports this?"
     - getForwardImports() — "what does this import?"
     - get2HopReverseDeps() — importers of importers
     - getCochanges() — co-commit partners
  8. Cluster-based co-change promotion — high-count cluster members (zero extra queries)
  9. formatContextPack() → compact markdown
  10. Cache set (120s TTL, 20 entries)
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

### Scoring Formula

Per-file score (applied to files matching at least one query term):

| Factor | Weight | Description |
|--------|--------|-------------|
| Filename token | 4x * IDF | camelCase/snake_case split |
| Directory token | 2x * IDF | Last 3 path segments |
| Export match | 2x * IDF | Exported symbols |
| Docstring/purpose | 1x * IDF | OR logic, no double-count |
| Coverage boost | *(1 + (matched/total)²) | Multi-term matches favored |
| Noise penalty | *0.3 | vendor/, .min.js, etc. |
| Activity boost | +min(recent, 5) * 0.5 | Recent commits (90d) |
| Cluster boost | *1.3 | Vocab cluster match |
| Indegree boost | *(1 + log2(deg) * 0.1) | Files imported by 3+ others |

Post-scoring: sibling dedup (max 2/group) → cap (import-depth-based, 8-15) → co-change promotion (up to 3) → semantic merge (up to 5 replacements)

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
     d. computeMaxImportDepth() — BFS from leaves, cycle-safe, stored in repos
     e. analyzeGitHistory() — git log → stats + co-changes
  8. Update repos state (last_indexed_commit, index_status)

Post-index (parallel, fire-and-forget from /index/run and register):
  a. ensureEmbedded() — Voyage API
  b. enrichPurpose(fullRun=true) — OpenRouter API (loops until all files done)
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

### Purpose Summaries (OpenRouter)

LLM-generated 1-sentence file descriptions in `index/lib/enrich-purpose.ts`:

1. Model: configurable via `index/lib/models.ts` (currently `qwen/qwen3-coder-next`)
2. API: OpenRouter (OpenAI-compatible), secret: `OpenRouterApiKey`
3. Input: exports list + docstring + first chunk (chunk_index=0) per file — gives LLM full context even when chunk 0 is just imports
4. Only code languages: TS, JS, Python, Ruby, Go, Rust, Java, Kotlin, C#, C++, C, Swift, PHP, Shell, SQL
5. Concurrency: 10 parallel API calls, 200 files per batch
6. `fullRun=true` (index/register): loops until all files done. `false` (cron): single 200-batch
7. Staleness: `purpose_hash` tracks `chunk_hash` of chunk 0 — purpose regenerates when content changes
8. Fallback: if API key missing, files keep `purpose = ''`, retries on next cron tick

Supplements regex `docstring` (~30-40% coverage) with LLM `purpose` (code files only). Scoring uses OR logic: `docstring || purpose` at 1x weight — no double-counting.

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

Every 5 minutes (`index/worker.ts`):
1. Find repos with stale index, NULL embeddings, or empty purpose (code languages only)
2. Advisory lock per repo
3. Re-index if HEAD changed
4. Embed chunks with NULL embedding (Voyage AI, batch 32)
5. Enrich files with empty purpose (OpenRouter, single 200-batch per cron tick)
6. Runs 30s after startup for immediate catch-up

## Model Configuration

All model names, API URLs, batch sizes, and secrets in **`index/lib/models.ts`** (single source of truth):

| Config | Value | Secret |
| --- | --- | --- |
| Embeddings | Voyage `voyage-code-3`, 1024 dim, batch 32 | `VoyageApiKey` |
| Purpose summaries | OpenRouter `qwen/qwen3-coder-next`, batch 200, concurrency 10 | `OpenRouterApiKey` |

```bash
encore secret set --type dev VoyageApiKey      # embeddings + vocab clusters
encore secret set --type dev OpenRouterApiKey   # purpose summaries
```

Both optional — context degrades gracefully without either (keyword-only, no semantic boost, no LLM summaries).

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
| file_metadata | repo_id, path, exports, imports, docstring, purpose, purpose_hash | Regex structure + LLM summaries |
| file_imports | repo_id, source_path, target_path | Directed import graph |
| file_stats | repo_id, path, commit_count, recent_count | Git activity per file |
| file_cochanges | repo_id, path_a, path_b, cochange_count | Co-commit pairs |

## Performance

| Operation | Latency | Notes |
| --- | --- | --- |
| `rlm context` (cold) | ~300-1000ms | Keyword + semantic + structural (4400-file repo) |
| `rlm context` (cached) | ~10ms | In-memory cache hit |
| Registration (4k files) | ~30-50s | Full scan + vocab clusters + git analysis |
| Force re-index (4k files) | ~45-90s | Includes Voyage API calls for clusters |

### Benchmark: RLM vs Manual Glob/Grep (4400-file C#/TS repo)

| Approach | Time per query | Files returned | Ranked? |
| --- | --- | --- | --- |
| RLM context | 0.5-7s | 12-15 | Yes — scored, enriched with deps/co-changes/activity |
| Manual grep (1 term) | 85-360s | 50-479 | No — unranked file list |
| Manual grep (5 terms) | 10-30 min | hundreds, unranked | No |

RLM delivers **100-200x faster** results that are **ranked and structurally enriched**, vs raw unranked file lists from grep.
