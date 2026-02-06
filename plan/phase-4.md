# Phase 4 — Summaries + Repo Memory

**Goal:** Cache file/dir summaries. Progressive disclosure: daemon provides context without dumping full files.

**Status:** [ ] Pending

**Depends on:** Phase 3

---

## Tasks

### 4.1 — Summaries table
- [ ] Migration `004_summaries.up.sql`:
  ```sql
  CREATE TABLE summaries (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id       UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    path          TEXT NOT NULL,            -- file path or dir path
    level         TEXT NOT NULL,            -- 'file' | 'directory'
    content_hash  TEXT NOT NULL,            -- SHA-256 of source file content (file level)
                                           -- or SHA-256 of child summaries (dir level)
    summary       TEXT NOT NULL,
    key_exports   JSONB,                   -- exported functions, classes, types
    dependencies  JSONB,                   -- imports/requires
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE(repo_id, path, level, content_hash)
  );
  CREATE INDEX idx_summaries_repo_path ON summaries(repo_id, path);
  ```
- [ ] No commit_hash column — `content_hash` alone determines freshness
- [ ] Same file content = same hash = cached summary survives across commits

### 4.2 — File summarizer
- [ ] Create `apps/rlm/summary/summarizer.ts`
- [ ] Input: file content + path + language
- [ ] Call GLM-4.7 with a focused prompt:
  - "Summarize this file in 3-5 sentences. List exported symbols. List imports."
- [ ] Output:
  ```ts
  {
    summary: string
    key_exports: string[]       // function names, class names, type names
    dependencies: string[]      // import paths
  }
  ```
- [ ] Token budget: keep prompt + file under model context limit
- [ ] For large files: summarize chunks individually, then merge

### 4.3 — Directory summarizer
- [ ] Create summary from child file summaries (not raw files)
- [ ] Input: list of file summaries in a directory
- [ ] Output: 2-3 sentence summary of the directory's purpose
- [ ] Recursive: dir summary built bottom-up

### 4.4 — Summary service
- [ ] Create `apps/rlm/summary/summary.ts`
- [ ] `POST /summary/generate` endpoint:
  - Input: `{ repo_id, paths?: string[] }` — if paths omitted, summarize all
  - Skip files whose `content_hash` matches existing summary
  - Response: `{ files_summarized, cached, duration_ms }`
- [ ] `GET /summary/:repo_id/file?path=<path>` — get single file summary
- [ ] `GET /summary/:repo_id/tree` — get repo summary tree (dir summaries)

### 4.5 — On-demand + cache invalidation
- [ ] `ensureSummarized(repo_id)` — lazy trigger, called from `rlm task`:
  ```
  1. ensureIndexed(repo_id)    ← Phase 2
  2. For each indexed file path:
     a. Compute content_hash of current file
     b. If summary exists with matching content_hash → skip
     c. Else → generate new summary
  3. For each directory with changed children → regenerate dir summary
  ```
- [ ] File changed → content_hash differs → old summary row stays (immutable), new row created
- [ ] Query always fetches summary matching current content_hash
- [ ] Orphan cleanup: periodically delete summaries whose content_hash has no matching file state

### 4.6 — Repo map generation
- [ ] `GET /summary/:repo_id/map` endpoint
- [ ] Return a condensed repo overview:
  ```
  src/
    auth/          — Authentication middleware + JWT handling
    api/
      routes.ts    — Express route definitions (15 endpoints)
      middleware.ts — Request validation + rate limiting
    db/
      models/      — Sequelize models (User, Post, Comment)
      migrations/  — 12 migrations
  ```
- [ ] Depth-limited (configurable, default 3 levels)
- [ ] Include file count per directory
- [ ] Built from cached dir summaries

### 4.7 — Wire up CLI
- [ ] `rlm summary` — triggers full summary generation
- [ ] `rlm summary <path>` — summarize specific file/dir
- [ ] `rlm map` — print repo map
- [ ] Output: clean markdown

---

## Exit Criteria

- [ ] `rlm summary` completes on a real repo
- [ ] `rlm summary src/auth/login.ts` returns cached summary (fast on second run)
- [ ] `rlm map` prints readable repo tree with descriptions
- [ ] Changing a file → re-running summary → only changed file re-summarized
- [ ] Summary quality: a developer can understand file purpose from summary alone

---

## Architecture Notes

```
apps/rlm/summary/
├── summary.ts          # POST /summary/generate, GET endpoints
├── summarizer.ts       # LLM-based file summarizer
├── directory.ts        # Directory summary (built from file summaries)
├── repomap.ts          # Repo map generator
└── migrations/
    └── 004_summaries.up.sql
```

### Summary hierarchy

```
repo (root)
├── src/           ← dir summary (from children)
│   ├── auth/      ← dir summary
│   │   ├── login.ts    ← file summary
│   │   └── jwt.ts      ← file summary
│   └── api/       ← dir summary
│       └── routes.ts   ← file summary
```
