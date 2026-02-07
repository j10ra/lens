# RLM — Architecture & Data Flow

## Overview

RLM is a local repo context daemon that indexes code, creates embeddings, and serves targeted context to Claude Code via CLI commands.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Claude Code Session                           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  CLAUDE.md  │    │    Bash     │    │    Read     │    │    Edit     │  │
│  │ Instructions│    │   (rlm CLI)  │    │  (native)   │    │  (native)   │  │
│  └──────┬──────┘    └──────┬──────┘    └─────────────┘    └─────────────┘  │
│         │                  │                                                    │
│         └──────────────────┴──────────────────────────────────────────────┘
│                            │
│                            ▼
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           rlm CLI (Node.js)                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Commands: task, search, read, run, status, summary, map, repo       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                             │
│                              ▼                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                               │ HTTP
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Encore.ts Daemon (localhost:4000)                 │
│                                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  │
│  │  health  │  │   repo   │  │  index   │  │  search  │  │ context │  │
│  │          │  │          │  │          │  │          │  │         │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └─────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │  runner  │  │ summary  │  │   read   │  │  worker  │                 │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Postgres + pgvector                             │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐          │   │
│  │  │ repos  │ │ chunks │ │summaries│ │ traces │ │scripts │          │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Local Models (optional)                         │   │
│  │  ┌──────────────────────┐  ┌──────────────────────┐                │   │
│  │  │  Transformers.js     │  │    Z.ai GLM-4.7      │                │   │
│  │  │  bge-small-en-v1.5   │  │    (LLM summaries)    │                │   │
│  │  │  384 dim             │  │                       │                │   │
│  │  └──────────────────────┘  └──────────────────────┘                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Complete Data Flow

### Phase 1: Registration (one-time per repo)

```
User: cd /path/to/project
User: rlm repo register
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ CLI: POST /repo/register                                     │
│   { root_path, name, remote_url }                           │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│ Repo Service:                                                │
│   1. Derive identity_key = SHA256(root_path + remote_url)   │
│   2. UPSERT repos table                                     │
│   3. If newly created → fire-and-forget:                    │
│      runIndex() → ensureEmbedded() → startWatcher()         │
│   4. Return repo_id + created flag                          │
└─────────────────────────────────────────────────────────────┘
                │
                ▼
         CLI prints repo_id
         + "Indexing + file watcher started"
```

---

### Phase 2: Indexing (lazy, on first `rlm task` or `rlm search`)

```
User: rlm task "investigate sync issue"
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ CLI: POST /task { repo_id, goal }                           │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│ Context Service:                                             │
│   1. ensureIndexed(repo_id) ───────────────────────┐       │
│   2. ensureEmbedded(repo_id) ────────────────────────┤       │
│   3. generateRepoMap() ───────────────────────────────┤       │
│   4. analyzeTask(goal) ────────────────────────────────┤       │
│   5. gatherContext() ───────────────────────────────────┤       │
│   6. getSmartTraces() ──────────────────────────────────┤       │
│   7. formatContextPack() ────────────────────────────────┘       │
│   8. Return context_pack                                         │
└─────────────────────────────────────────────────────────────┘
```

#### `ensureIndexed()` — Diff-Aware Chunking

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Get repos row: { last_indexed_commit, root_path }        │
│                                                              │
│ 2. Get current HEAD: git rev-parse HEAD                     │
│                                                              │
│ 3. If HEAD == last_indexed_commit → RETURN null (up-to-date)│
│                                                              │
│ 4. If last_indexed_commit IS NULL → fullScan()             │
│    else → diffScan(old_commit, new_commit)                  │
│                                                              │
│ 5. For each changed file:                                    │
│    a. Skip binary, skip >500KB                              │
│    b. Read file content                                      │
│    c. Chunk it: ~150 lines, 10 line overlap                 │
│    d. For each chunk:                                        │
│       - Compute chunk_hash = SHA256(content + params)       │
│       - Check if (repo_id, path, chunk_index, chunk_hash)   │
│         exists in chunks table                              │
│       - If exists → UPDATE last_seen_commit (keep embedding)│
│       - If not → INSERT new row (embedding = NULL)         │
│    e. Delete stale chunks (changed hash at same index)      │
│                                                              │
│ 6. For deleted files: DELETE FROM chunks WHERE path = $1   │
│                                                              │
│ 7. Update repos:                                             │
│    SET last_indexed_commit = HEAD                            │
│        index_status = 'ready'                                │
│        last_indexed_at = now()                               │
│                                                              │
│ 8. Return { files_scanned, chunks_created, duration_ms }    │
└─────────────────────────────────────────────────────────────┘
```

#### `ensureEmbedded()` — Lazy Embedding

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Count chunks WHERE repo_id = $1 AND embedding IS NULL    │
│                                                              │
│ 2. If count == 0 → RETURN (all cached)                      │
│                                                              │
│ 3. While chunks with NULL embeddings remain:                │
│    a. Fetch batch of 32 chunks (id, content)                │
│    b. Call local embedder (Transformers.js):                 │
│       - Prefix chunks with "passage: "                       │
│       - Run bge-small-en-v1.5 model                         │
│       - Get 384-dim vectors                                  │
│    c. For each chunk:                                        │
│       UPDATE chunks SET embedding = vector(...) WHERE id=$id │
│    d. Increment embedded_count                               │
│                                                              │
│ 4. If embedded_count > 100 → ANALYZE chunks                 │
│                                                              │
│ 5. Return { embedded_count, duration_ms }                    │
└─────────────────────────────────────────────────────────────┘
```

---

### Phase 2.7: File Watcher (real-time updates)

```
rlm repo register (auto) or rlm repo watch (manual)
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Watcher Module (chokidar, in-memory per repo):              │
│                                                              │
│   chokidar.watch(repoRoot, {                                │
│     ignored: [dotfiles, node_modules, .git, dist, build],   │
│     ignoreInitial: true,                                    │
│     awaitWriteFinish: { stabilityThreshold: 200 }           │
│   })                                                        │
│                                                              │
│   on "add" / "change":                                      │
│     debounce 500ms →                                        │
│       1. Skip binary, >500KB                                │
│       2. Read file, chunkFile()                              │
│       3. Compare (chunk_index, chunk_hash) with DB          │
│       4. INSERT new chunks (embedding=NULL)                  │
│       5. DELETE stale chunks                                │
│       6. last_seen_commit = 'watcher'                       │
│                                                              │
│   on "unlink":                                              │
│     debounce 500ms →                                        │
│       DELETE chunks WHERE path = $1                          │
│                                                              │
│   Endpoints:                                                │
│     POST /index/watch      → startWatcher(repo_id)          │
│     POST /index/unwatch    → stopWatcher(repo_id)           │
│     GET  /index/watch-status/:repo_id → status              │
│                                                              │
│   Note: Watchers are in-memory, lost on daemon restart.     │
│         Background worker still handles commit-level index.  │
└─────────────────────────────────────────────────────────────┘
```

---

### Phase 3: Context Pack Building

```
┌─────────────────────────────────────────────────────────────┐
│ generateRepoMap(repo_id)                                    │
│   → Build tree structure from summaries table               │
│     (dirs have cached summaries, files have cached summaries)│
│                                                              │
│ analyzeTask(goal, repoMap)                                  │
│   → Extract keywords from goal (stopwords filtered)         │
│   → Match keywords against repo paths → likely_files        │
│   → Detect task_type: fix | feature | refactor | test      │
│   → Return { keywords, likely_files, scope, task_type }     │
│                                                              │
│ gatherContext(repo_id, analysis)                            │
│   → For each keyword: hybrid search (grep + semantic)       │
│   → Collect unique file paths                                │
│   → For each file:                                          │
│      - Fetch cached summary from summaries table            │
│      - Fetch key_exports, dependencies                      │
│      - Read code snippets (expanded ±10 lines)              │
│   → Return { repoMap, relevantFiles[], dependencyGraph }    │
│                                                              │
│ getSmartTraces(repo_id, keywords, relevantPaths)           │
│   → Fetch traces from last 30 minutes                        │
│   → Priority rank: run failures > run success > search > read│
│   → Affinity boost: matches goal keywords or paths          │
│   → Return top 8 traces, sorted chronologically             │
│                                                              │
│ formatContextPack(...)                                      │
│   → Minimal pack: Tools + Repo Structure + File Paths       │
│   → NO cached summaries, NO code snippets (avoid bias)      │
└─────────────────────────────────────────────────────────────┘
```

---

### Phase 4: Search (hybrid grep + semantic)

```
User: rlm search "indexeddb sync depot"
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ CLI: POST /search { repo_id, query, mode, limit }          │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│ Search Service:                                             │
│   1. ensureIndexed(repo_id)                                 │
│   2. ensureEmbedded(repo_id)                                │
│   3. Resolve mode based on embedding availability           │
│                                                              │
│   IF mode == "grep":                                        │
│     → grepSearch(): ILIKE '%query%' on chunks.content        │
│                                                              │
│   IF mode == "semantic":                                    │
│     → Embed query with "query: " prefix                      │
│     → vectorSearch(): cosine similarity top-k               │
│                                                              │
│   IF mode == "hybrid" (default):                            │
│     → Run grep + semantic in parallel                        │
│     → Merge + rerank: score = grep*0.3 + semantic*0.7       │
│     → Return top-k                                          │
│                                                              │
│   4. Fire-and-forget trace recording                        │
│   5. Return { results[], search_mode_used }                │
└─────────────────────────────────────────────────────────────┘
```

---

### Phase 5: Read & Runner

```
User: rlm read "Project/src/file.ts"
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Read Service:                                                │
│   1. Look up repo root_path from repos table               │
│   2. Resolve full path, validate no path traversal           │
│   3. Read file from disk                                    │
│   4. Apply line range filters (start, end)                  │
│   5. Fire-and-forget trace recording                        │
│   6. Return { path, content, start_line, end_line, total }   │
└─────────────────────────────────────────────────────────────┘


User: rlm run "npm test"
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Runner Service:                                              │
│   1. Look up repo root_path                                  │
│   2. Parse command into [exe, ...args]                       │
│   3. Check exe against allowlist (npm, cargo, python, etc.) │
│   4. Spawn process with 120s timeout, 100KB output cap      │
│   5. Capture stdout/stderr, duration                         │
│   6. INSERT trace (await, needs trace_id for response)       │
│   7. Return { exit_code, stdout, stderr, trace_id, duration }│
└─────────────────────────────────────────────────────────────┘
```

---

### Phase 6: Background Worker (cron)

```
Every 5 minutes:
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ CronJob: POST /worker/maintain                               │
│                                                              │
│ 1. Find repos needing work:                                 │
│    SELECT repos WHERE                                       │
│      last_indexed_commit IS NOT NULL                        │
│      AND (                                                  │
│        EXISTS chunks with NULL embedding                    │
│        OR EXISTS traces in last 24h                         │
│      )                                                      │
│                                                              │
│ 2. For each repo:                                           │
│    a. Try pg_advisory_lock(repo_id hash)                    │
│    b. If locked → skip (another run owns it)                │
│    c. Get current HEAD via git rev-parse                    │
│    d. If HEAD != last_indexed_commit → ensureIndexed       │
│    e. If chunks with NULL embedding → ensureEmbedded        │
│    f. Release advisory lock                                 │
│                                                              │
│ 3. Return { processed_count, error_count }                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Design Principles

### 1. Content-Addressed Storage

```
chunk_hash = SHA256(content + chunking_params)
```

- Same content + same config = same hash
- Unchanged chunks across commits keep their embeddings
- No redundant embedding work

### 2. Eager + Live

- Indexing fires on register (no wait for first `rlm task`)
- File watcher updates chunks in real-time on save
- Embeddings happen only for new/changed chunks
- Background worker keeps things fresh but doesn't block

### 3. Graceful Degradation

- No embeddings? → grep works fine
- LLM API down? → summaries skip, context pack still works
- Partial index? → returns what's available

### 4. Per-Repo Isolation

- Every query filters by `repo_id`
- ON DELETE CASCADE cleans up when repo removed
- Advisory locks prevent concurrent indexing races

### 5. Minimal Context (No Poisoning)

- Context pack = orientation + file paths only
- No cached summaries that could mislead
- Claude must investigate via `rlm search` + `rlm read`

---

## Performance Characteristics

| Operation                | Latency      | Notes                     |
| ------------------------ | ------------ | ------------------------- |
| `rlm task` (fresh repo)  | 2-10s        | Index + embed first time  |
| `rlm task` (cached repo) | 100-200ms    | Git check + context build |
| `rlm search`             | 200-500ms    | Hybrid grep + semantic    |
| `rlm read`               | 10-50ms      | Disk read + validation    |
| `rlm run`                | command time | Sandbox overhead ~5ms     |
| Background worker        | N/A          | 5m cron, gated            |

---

## Storage Footprint

| Table      | Per-Chunk Size            | 10k files (~80k chunks) |
| ---------- | ------------------------- | ----------------------- |
| chunks     | ~2KB (content + metadata) | ~160MB                  |
| embeddings | 1.5KB (384-dim vector)    | ~120MB                  |
| summaries  | ~500B                     | ~5MB                    |
| traces     | ~500B                     | ~5MB                    |
| **Total**  | ~4KB/chunk                | **~300MB**              |

---

## Integration Points

### For Other Projects

1. Add `CLAUDE.md` with RLM instructions
2. Run `rlm repo register` once
3. Claude Code automatically uses `rlm` via Bash

### For Claude Desktop (MCP)

Would require building an MCP server package that wraps the HTTP API. Not currently implemented.

---

## Troubleshooting

| Issue                                | Fix                                                     |
| ------------------------------------ | ------------------------------------------------------- |
| `fetch failed - service not running` | Start daemon: `cd /Volumes/Drive/__x/RLM && encore run` |
| `repo not found`                     | Run `rlm repo register` in project dir                  |
| Search returns empty                 | Run `rlm index --force`                                 |
| Embeddings stuck at 0%               | Check local model is downloading (first run)            |
| High memory usage                    | Worker is processing large repo; normal                 |
