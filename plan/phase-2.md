# Phase 2 — Indexing + Chunking

**Goal:** Turn repo files into searchable chunk records in Postgres. Indexing is on-demand, diff-aware, and idempotent.

**Status:** [ ] Pending

**Depends on:** Phase 0, Phase 1

---

## Core Tracking Strategy

Everything keyed by `(repo_id, path, chunk_index, chunk_hash)`.

- **chunk_hash** = `SHA-256(chunk_content + chunking_params)` — deterministic per content + config
- **chunk_index** = 0-based position within file — preserves location for duplicate content
- **last_seen_commit** = git HEAD when chunk was last confirmed present (not part of identity key)
- If `chunk_hash` at same `chunk_index` didn't change → skip (don't re-embed, don't re-summarize)
- If `last_seen_commit` on `repos` advanced → `git diff old..new --name-only` → only reprocess changed files

---

## Tasks

### 2.1 — Database schema for chunks
- [ ] Migration `002_chunks.up.sql`:
  ```sql
  CREATE TABLE chunks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id             UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    path                TEXT NOT NULL,
    chunk_index         INT NOT NULL,             -- 0-based position within file
    start_line          INT NOT NULL,
    end_line            INT NOT NULL,
    content             TEXT NOT NULL,
    chunk_hash          TEXT NOT NULL,             -- SHA-256(content + chunking_params)
    last_seen_commit    TEXT NOT NULL,             -- git HEAD when last confirmed present
    language            TEXT,
    embedding           vector(1536),             -- NULL until embedded (Phase 3)
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE(repo_id, path, chunk_index, chunk_hash)
  );
  CREATE INDEX idx_chunks_repo_path ON chunks(repo_id, path);
  CREATE INDEX idx_chunks_repo ON chunks(repo_id);
  CREATE INDEX idx_chunks_hash ON chunks(repo_id, chunk_hash);
  CREATE INDEX idx_chunks_needs_embedding ON chunks(repo_id) WHERE embedding IS NULL;
  ```
- [ ] `embedding` column added here, populated in Phase 3
- [ ] `chunk_index` preserves position — same content at two locations in a file = two distinct rows
- [ ] `last_seen_commit` = "this chunk was verified present at this commit" (content-addressed, survives across commits)
- [ ] Partial index `idx_chunks_needs_embedding` makes `ensureEmbedded()` fast

### 2.2 — Repo index state (on `repos` table)
- [ ] Migration adds columns to `repos`:
  ```sql
  ALTER TABLE repos ADD COLUMN last_indexed_commit TEXT;
  ALTER TABLE repos ADD COLUMN index_status TEXT DEFAULT 'pending';
  ALTER TABLE repos ADD COLUMN last_indexed_at TIMESTAMPTZ;
  ```
- [ ] States: `pending` → `indexing` → `ready` → `stale`
- [ ] `stale` = current HEAD != `last_indexed_commit`

### 2.3 — File discovery
- [ ] Create `apps/rlm/index/discovery.ts`
- [ ] Two modes:
  - **Full scan**: `git ls-files` → all tracked files
  - **Diff scan**: `git diff <old_commit>..<new_commit> --name-only --diff-filter=ACMRD` → only changed/added/deleted files
- [ ] Skip binary files (extension list + null byte check)
- [ ] Skip files > 500KB (configurable)
- [ ] Return `Array<{ path, absolute_path, language, status }>` — status: added | modified | deleted

### 2.4 — Chunking strategy
- [ ] Create `apps/rlm/index/chunker.ts`
- [ ] Strategy: **boundary-aware fixed-size chunks**
  - Target: ~150 lines (configurable)
  - Split on logical boundaries: blank lines, function/class declarations
  - Overlap: 10 lines between chunks
- [ ] `chunk_hash = SHA-256(content + JSON.stringify(chunking_params))`
  - `chunking_params = { target_lines, overlap_lines, version: 1 }`
  - Changing chunking config → all hashes change → full re-index (intentional)
- [ ] Output: `Array<{ chunk_index, start_line, end_line, content, chunk_hash }>`
  - `chunk_index` = 0-based sequential position in file

### 2.5 — Diff-aware indexing engine
- [ ] Create `apps/rlm/index/engine.ts`
- [ ] Core logic:
  ```
  1. Get current HEAD commit
  2. Get last_indexed_commit from repos table
  3. If same → skip (already up to date)
  4. If last_indexed_commit is NULL → full scan
  5. Else → diff scan (changed files only)
  6. For each changed file:
     a. Chunk the file → get (chunk_index, chunk_hash) pairs
     b. Compare (chunk_index, chunk_hash) against existing chunks for (repo_id, path)
     c. INSERT new chunks where (chunk_index, chunk_hash) combo doesn't exist
     d. DELETE stale chunks where chunk_index exists but chunk_hash differs
     e. Unchanged chunks: update last_seen_commit + touch updated_at
  7. For deleted files: DELETE all chunks for that path
  8. Update repos.last_indexed_commit = current HEAD
  ```
- [ ] Advisory lock per repo_id to prevent concurrent runs
- [ ] Response: `{ files_scanned, chunks_created, chunks_unchanged, chunks_deleted, duration_ms }`

### 2.6 — On-demand trigger (lazy indexing)
- [ ] Create `apps/rlm/index/ensure.ts`
- [ ] `ensureIndexed(repo_id)` — called before any search/task/summary:
  ```
  1. Get repo from DB
  2. Get current git HEAD
  3. If HEAD == last_indexed_commit → return (no-op)
  4. If last_indexed_commit is NULL → full index
  5. Else → diff index
  ```
- [ ] This is the primary trigger — `rlm task` and `rlm search` call it automatically
- [ ] `rlm index` CLI command still exists for explicit manual runs

### 2.7 — File watcher (optional, background)
- [ ] Create `apps/rlm/index/watcher.ts`
- [ ] Use chokidar to watch registered repo paths
- [ ] On file change/add/delete:
  - Debounce (500ms)
  - Partial reindex: only re-chunk the changed file
  - Mark repo as `stale` (don't block on full commit-based diff)
- [ ] Watcher is opt-in: `POST /repo/watch` to start, `POST /repo/unwatch` to stop
- [ ] Watcher runs in daemon process (not CLI)
- [ ] CLI: `rlm repo watch` / `rlm repo unwatch`

### 2.8 — Indexing service endpoints
- [ ] `POST /index/run` — explicit full/diff index
  - Input: `{ repo_id, force?: boolean }` — force = ignore last_indexed_commit, full scan
- [ ] `GET /index/status/:repo_id` — return:
  ```ts
  {
    index_status, last_indexed_commit, last_indexed_at,
    current_head,              // live git HEAD
    is_stale: boolean,         // current_head != last_indexed_commit
    chunk_count, files_indexed,
    chunks_with_embeddings,    // count (for Phase 3)
    watcher_active: boolean
  }
  ```

### 2.9 — Wire up CLI
- [ ] `rlm index` — explicit trigger (calls `POST /index/run`)
- [ ] `rlm index --force` — full re-index
- [ ] `rlm index --status` — show index state
- [ ] `rlm repo watch` / `rlm repo unwatch` — toggle file watcher

### 2.10 — Wire up search (basic grep)
- [ ] Update `POST /search` to query chunks table
- [ ] `WHERE content ILIKE '%query%'` (basic, replaced in Phase 3)
- [ ] Calls `ensureIndexed()` before searching
- [ ] Return top 20 matches: `path`, `start_line`, `end_line`, snippet

---

## Exit Criteria

- [ ] `rlm task "..."` auto-indexes repo on first call (full scan)
- [ ] Second `rlm task` on unchanged repo → 0 chunks created (instant)
- [ ] Commit a change → next `rlm task` → only changed files re-chunked
- [ ] `rlm search "functionName"` returns matching chunks
- [ ] Delete a file + commit → chunks for that file removed on next call
- [ ] File watcher: edit a file → chunk updates within seconds
- [ ] Concurrent `rlm task` calls → no duplicate chunks (advisory lock)

---

## Architecture Notes

```
apps/rlm/index/
├── engine.ts           # Core diff-aware indexing logic
├── ensure.ts           # ensureIndexed() — lazy trigger for search/task
├── discovery.ts        # git ls-files (full) + git diff (diff mode)
├── chunker.ts          # Boundary-aware chunking + chunk_hash
├── watcher.ts          # Chokidar file watcher (opt-in)
├── index.ts            # HTTP endpoints: POST /index/run, GET /index/status
└── migrations/
    └── 002_chunks.up.sql
```

### Diff-aware flow

```
rlm task "add tests"
     │
     ▼
ensureIndexed(repo_id)
     │
     ├── HEAD == last_indexed_commit? → skip ✓
     │
     └── HEAD != last_indexed_commit?
              │
              ▼
         git diff old..new --name-only
              │
              ▼
         changed files only
              │
         ┌────┴────┐
         ▼         ▼
      Chunk     Delete stale
      changed   chunks for
      files     deleted files
         │
         ▼
      Compare chunk_hashes
         │
    ┌────┴────┐
    ▼         ▼
  New hash   Same hash
  → INSERT   → no-op
```

### Chunk hash determinism

```
chunk_hash = SHA-256(
  content: "function login(user, pass) { ... }",
  params:  { target_lines: 150, overlap_lines: 10, version: 1 }
)

Same content + same params = same hash, always.
Change chunking config = all hashes change = full re-index.

Unique key: (repo_id, path, chunk_index, chunk_hash)
  → same content at TWO positions in same file = two rows (chunk_index differs)
  → same content at same position across commits = one row (last_seen_commit updated)
```
