# Phase 7 — Multi-Repo Support

**Goal:** One daemon serves all repos. Switch repos seamlessly — indexing, caches, and search are isolated per repo.

**Status:** [ ] Pending

**Depends on:** Phase 0–6

---

## Tasks

### 7.1 — Repo identity (already implemented in Phase 0)
- [ ] `identity_key` derivation + normalization was built in Phase 0.4
- [ ] Verify: same remote from two clones → same `identity_key` → same repo row
- [ ] Verify: register from new path → updates `root_path` on existing repo (upsert)
- [ ] Edge case: repo moves from path-based identity to remote-based (user adds remote later)
  - Handle: re-register detects remote → compute new identity_key → migrate data or warn

### 7.2 — Per-repo isolation audit
- [ ] Verify ALL queries filter by `repo_id`:
  - chunks table queries
  - summaries table queries
  - traces table queries
  - search operations
- [ ] Add integration test: two repos, same file names, different content → search returns only correct repo's results

### 7.3 — Per-repo status endpoint (consolidation)
- [ ] Repo state columns (`index_status`, `last_indexed_commit`, `last_indexed_at`) already added in Phase 2
- [ ] `GET /repo/:id/status` returns aggregated state:
  ```ts
  {
    repo_id, name, root_path, remote_url,
    index_status,
    last_indexed_commit,
    last_indexed_at,
    current_head,
    is_stale: boolean,
    chunk_count,              // SELECT COUNT(*) FROM chunks WHERE repo_id = $1
    embedded_count,           // SELECT COUNT(*) FROM chunks WHERE repo_id = $1 AND embedding IS NOT NULL
    summaries_count,
    watcher_active: boolean
  }
  ```
- [ ] Stale detection already handled by `ensureIndexed()` (Phase 2) — auto-reindexes on `rlm task`
- [ ] CLI `rlm repo list` shows stale indicator per repo

### 7.5 — Repo cleanup
- [ ] `DELETE /repo/:id` endpoint
- [ ] Cascading delete: chunks, summaries, traces — all removed
- [ ] CLI: `rlm repo remove` — with confirmation
- [ ] `rlm repo list` — show all repos with status

### 7.6 — CLI multi-repo UX
- [ ] `rlm repo list` — table of all repos:
  ```
  ID        Name         Status    Files   Chunks  Last Indexed
  abc123    my-app       ready     340     2,100   2 hours ago
  def456    api-server   stale     120     800     3 days ago
  ```
- [ ] All commands auto-detect current repo from cwd
- [ ] If cwd is not in a registered repo → prompt to register
- [ ] `rlm repo switch <name>` — not needed (auto-detect handles it)

### 7.7 — Resource management
- [ ] Set limits per repo:
  - Max chunks: 100,000
  - Max file size: 500KB
  - Max total indexed size: 500MB per repo
- [ ] `GET /daemon/stats` — global stats:
  ```ts
  {
    repos_count, total_chunks, total_embeddings,
    db_size_mb, uptime_seconds
  }
  ```
- [ ] CLI: `rlm status` — daemon health + global stats

---

## Exit Criteria

- [ ] Register 3+ repos from different directories
- [ ] Each repo's search returns only its own results
- [ ] `rlm repo list` shows all repos with accurate status
- [ ] Switch directories → `rlm search` automatically targets correct repo
- [ ] Stale detection works: new commits → warning shown
- [ ] Delete a repo → all associated data removed
- [ ] Same repo in two locations (same remote) → recognized as same

---

## Architecture Notes

```
apps/rlm/repo/
├── repo.ts             # CRUD endpoints (updated)
├── identity.ts         # Repo ID derivation logic
├── db.ts               # Database declaration
└── migrations/
    ├── 001_init.up.sql
    └── 006_repo_state.up.sql
```

### Multi-repo data isolation

```
┌─────────────────────────────────────────┐
│              Postgres                    │
│                                         │
│  repos: [my-app, api-server, lib]      │
│                                         │
│  chunks:                                │
│    repo_id=abc → my-app chunks only     │
│    repo_id=def → api-server chunks only │
│                                         │
│  summaries:                             │
│    repo_id=abc → my-app summaries       │
│    repo_id=def → api-server summaries   │
│                                         │
│  traces:                                │
│    repo_id=abc → my-app traces          │
│    repo_id=def → api-server traces      │
└─────────────────────────────────────────┘
```
