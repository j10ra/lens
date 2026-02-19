# Phase 02: Intelligence Engine - Research

**Researched:** 2026-02-19
**Domain:** Code intelligence indexing — file discovery, TF-IDF, import graph, co-change analysis, hub scoring, structural grep
**Confidence:** HIGH — primary source is working v1 implementation (git tag `v1-archive`), supplemented by current codebase inspection

---

## Summary

Phase 2 builds the `@lens/engine` package from a minimal stub into a full code intelligence engine. The v1 implementation (tagged `v1-archive`) is the authoritative reference — it proved that TF-IDF over file metadata (exports, docstrings, sections, internals), combined with import graph indegree and co-change frequency, produces meaningful structural grep results. v2 strips the v1 embedding and vector search layers entirely (LENS v2 is deterministic, no embeddings) and plugs the scoring pipeline into the `lensFn()` wrapper pattern from `@lens/core`.

The key design insight from v1: don't do full-text search over chunk content for ranking — build an inverted index over file **metadata** (exports list, docstring, sections, internals) and score files, not chunks. Chunk content is used only for line-level snippet retrieval after files are ranked. This keeps TF-IDF fast (metadata rows are small) and makes results structurally meaningful.

The five plans map cleanly: schema + pipeline (02-01), import graph (02-02), co-change (02-03), hub scoring (02-04), grep route + repo management routes (02-05). All engine functions must be wrapped in `lensFn()`. All daemon routes must be wrapped in `lensRoute()`. Two separate SQLite databases: engine index at `~/.lens/index.db`, traces at `~/.lens/traces.db` (already created by Phase 1).

**Primary recommendation:** Port v1's engine layer directly with minimal changes. Replace v1's telemetry/trace module with `lensFn()` from `@lens/core`. Strip embeddings/vectors entirely. Keep all the structural analysis code — it works.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ENGN-01 | File discovery scans repo, respects .gitignore, detects file types | v1: `git ls-files -z` + extension map — proven approach, respects .gitignore by definition |
| ENGN-02 | TF-IDF scoring computes term relevance across indexed files | v1: `interpretQuery()` in `query-interpreter.ts` — IDF over metadata fields, per-field weights |
| ENGN-03 | Import graph construction extracts import/export edges from TypeScript files | v1: regex-based `extractImportSpecifiers()` + `resolveImport()` in `imports.ts` — handles TS/JS/Python/Go/Rust |
| ENGN-04 | Co-change analysis parses git log to identify files that change together | v1: `analyzeGitHistory()` in `git-analysis.ts` — `git log --name-only`, pair frequency with MIN threshold |
| ENGN-05 | Hub file detection identifies high-connectivity files via import graph + co-change signals | v1: indegree from `getIndegrees()` + co-change count → multiplicative score boost in `interpretQuery()` |
| ENGN-06 | Composite scoring combines TF-IDF, import graph, co-change, and hub signals | v1: single `interpretQuery()` function — TF-IDF base, indegree boost, recent_count hotness boost, export-count dampening |
| ENGN-07 | `lens grep "foo|bar|baz"` returns matches per term, ranked by composite score, each match enriched with structural metadata | v1: `buildContext()` pattern; v2 grep returns per-term results with importers, co-change partners, hub_score |
| ENGN-08 | Every engine function wrapped in `lensFn()` — no naked exports | `@lens/core`'s `lensFn()` is the wrapper; v1 used its own tracing module — swap in lensFn |
| DAEM-05 | Repo registration and management (add/remove/list repos) | v1: `registerRepo()`, `removeRepo()`, `listRepos()` in `repo/repo.ts` — direct port; wire into daemon routes |
| DAEM-06 | Index trigger endpoint (manual reindex) | v1: `runIndex()` in `index/engine.ts` — per-repo mutex prevents concurrent indexing; daemon exposes POST /repos/:id/index |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^12.6.2 | SQLite engine index DB | Already in @lens/core; synchronous API matches engine's non-async query pattern; 10x faster than sql.js |
| drizzle-orm | ^0.45.1 | ORM for engine index schema | Already in @lens/core; same version must be used — version mismatch causes type errors |
| node:child_process (execFile) | built-in | git CLI calls (discovery, git log) | v1 proven; no git library overhead; `git ls-files` and `git log --name-only` are the only operations needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:crypto | built-in | SHA-256 chunk hashes, identity key derivation | Used in chunker (content hashing) and repo identity (sha256 of remote URL / root path) |
| node:fs/promises | built-in | Read file content for chunking/indexing | Prefer async `readFile` over sync in the indexing loop |
| node:path | built-in | Import specifier resolution, path normalization | Cross-platform path ops in import graph construction |

### Removed from v1 (not needed in v2)
| v1 Library | Why Removed |
|------------|-------------|
| chokidar | Watcher not in Phase 2 scope; incremental indexing triggered manually |
| voyageai / openai | No embeddings in v2; deterministic only |
| @xenova/transformers | Same — no local embeddings |
| ts-morph | v1 used regex extraction, not ts-morph; regex approach is proven and sufficient |

**Note on ts-morph:** The roadmap mentions "ts-morph" for Plan 02-02 import graph, but v1 used pure regex (`extractImportSpecifiers()` in `imports.ts`) which already handles TS/JS/Python/Go/Rust correctly. Regex approach avoids ts-morph's heavy dependency and TypeScript compiler overhead. Recommend staying with regex unless ts-morph provides a concrete benefit that regex misses. **Decision point for planner.**

**Note on simple-git:** The roadmap mentions "simple-git" for Plan 02-03, but v1 used raw `git log` via `execFile` with no library. The `execFile` approach works and has zero deps. **Decision point for planner.**

**Installation (engine package additions):**
```bash
pnpm --filter @lens/engine add better-sqlite3 drizzle-orm
pnpm --filter @lens/engine add -D @types/better-sqlite3 @types/node drizzle-kit tsup typescript
```

---

## Architecture Patterns

### Recommended Project Structure
```
packages/engine/src/
├── db/
│   ├── connection.ts     # openEngineDb(), getEngineDb(), Db type
│   ├── schema.ts         # Drizzle table definitions (repos, chunks, file_metadata, file_imports, file_stats, file_cochanges)
│   └── queries.ts        # Typed query functions grouped by table (repoQueries, chunkQueries, etc.)
├── index/
│   ├── engine.ts         # runIndex() — orchestrates discovery → chunking → metadata → import graph → git analysis
│   ├── discovery.ts      # fullScan(), diffScan(), getHeadCommit(), language detection
│   ├── chunker.ts        # chunkFile() — boundary-aware splitting with overlap
│   ├── extract-metadata.ts  # extractFileMetadata(), extractAndPersistMetadata()
│   ├── imports.ts        # extractImportSpecifiers(), resolveImport() — regex-based
│   ├── import-graph.ts   # buildAndPersistImportGraph() — reads chunks, resolves imports, writes file_imports
│   └── git-analysis.ts   # analyzeGitHistory() — git log parsing, file_stats + file_cochanges
├── grep/
│   ├── scorer.ts         # interpretQuery() — TF-IDF base score + indegree + co-change + hotness
│   ├── structural.ts     # getIndegrees(), getReverseImports(), getCochangePartners() — DB queries
│   └── grep.ts           # grepRepo() — term split → score → enrich → return results
├── repo/
│   ├── identity.ts       # deriveIdentityKey() — sha256 of remote URL or root path
│   └── repo.ts           # registerRepo(), removeRepo(), listRepos(), getRepoStatus()
└── index.ts              # Public exports — all wrapped in lensFn()
```

### Pattern 1: lensFn Wrapping All Engine Exports

Every exported function in `packages/engine/src/` must be wrapped in `lensFn()` from `@lens/core`. The wrapper provides automatic span recording — no manual tracing needed.

```typescript
// Source: packages/core/src/lens-fn.ts (Phase 1 output)
import { lensFn } from "@lens/core";

// WRONG — naked export
export async function runIndex(db: Db, repoId: string): Promise<IndexResult> { ... }

// CORRECT — wrapped export
export const runIndex = lensFn("engine.runIndex", async (db: Db, repoId: string): Promise<IndexResult> => {
  // implementation
});
```

**CRITICAL:** `lensFn()` only wraps `async` functions. Synchronous engine functions (e.g., `chunkFile`, `extractFileMetadata`) that are called internally don't need wrapping — only publicly exported functions that cross the engine boundary need it. Internal sync helpers can be plain functions.

### Pattern 2: Engine DB Connection (Singleton, configure-once)

Following the `configure*()` pattern established in Phase 1:

```typescript
// packages/engine/src/db/connection.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema>;

let _db: Db | null = null;

export function configureEngineDb(dbPath: string): Db {
  if (_db) return _db;
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  // Run CREATE TABLE IF NOT EXISTS via raw SQL (idempotent)
  sqlite.exec(createTablesSql());
  _db = drizzle(sqlite, { schema });
  return _db;
}

export function getEngineDb(): Db {
  if (!_db) throw new Error("Engine DB not initialized. Call configureEngineDb() first.");
  return _db;
}
```

The daemon calls `configureEngineDb(join(DATA_DIR, "index.db"))` at startup alongside the TraceStore initialization.

### Pattern 3: Git-Based File Discovery (no .gitignore parsing needed)

```typescript
// packages/engine/src/index/discovery.ts
// Source: v1-archive:packages/engine/src/index/discovery.ts

export async function fullScan(repoRoot: string): Promise<DiscoveredFile[]> {
  // git ls-files respects .gitignore automatically — no gitignore parsing library needed
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    maxBuffer: 50 * 1024 * 1024,
  });
  const paths = stdout.split("\0").filter(Boolean);
  // Filter binary extensions + files >2MB
  // ...
}

export async function diffScan(repoRoot: string, fromCommit: string, toCommit: string): Promise<DiscoveredFile[]> {
  // Only scan files that changed since last index — incremental
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-status", "--diff-filter=ACMRD", "-z", `${fromCommit}..${toCommit}`],
    { cwd: repoRoot, maxBuffer: 50 * 1024 * 1024 },
  );
  // ...
}
```

**Key insight:** `git ls-files` inherently respects `.gitignore` — no separate gitignore parsing library required. ENGN-01 is satisfied without ignoring additional deps.

### Pattern 4: In-Memory Mutex for Index Locking

```typescript
// packages/engine/src/index/engine.ts
// Prevent concurrent indexing of the same repo
const locks = new Map<string, Promise<void>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  while (locks.has(key)) await locks.get(key);
  let resolve!: () => void;
  const p = new Promise<void>((r) => { resolve = r; });
  locks.set(key, p);
  try {
    return await fn();
  } finally {
    locks.delete(key);
    resolve();
  }
}

export const runIndex = lensFn("engine.runIndex", async (db: Db, repoId: string, force = false) => {
  return withLock(repoId, async () => {
    // ...indexing pipeline
  });
});
```

### Pattern 5: TF-IDF Over Metadata (not chunk content)

The scoring algorithm operates on `file_metadata` rows, not raw chunk content. This is critical for performance — the `file_metadata` table is small (one row per file), whereas `chunks` can be 100K+ rows.

```typescript
// TF-IDF formula used in v1 (verified from v1 query-interpreter.ts):
// IDF(term) = min(10, max(1, log(N / df)))  where N = total files, df = files containing term
// Score(file) = sum over terms: IDF(term) * fieldWeight * matchBoolean
//
// Field weights (from v1):
//   file name tokens: 4x
//   dir path tokens:  2x
//   exports:          2-2.5x (exact match on decomposed camelCase tokens)
//   docstring:        1x
//   sections:         1x
//   internals:        1.5x
//
// Boosters applied after TF-IDF base:
//   recent_count > 0:     +0.5 per recent commit (capped at 5)
//   indegree >= 3:        score *= 1 + log2(indegree) * 0.1
//   hub dampening:        if exports > 5: score *= 1/(1 + log2(exports/5)*0.3)
//   multi-term coverage:  if matchedTerms > 1: score *= 1 + coverage^2
```

### Pattern 6: Grep Result Shape (v2 format)

v2 grep returns per-term results enriched with structural metadata. The `/grep` route POST body is already stubbed in Phase 1:

```typescript
// Input (already wired in Phase 1 stub):
{ repoPath: string, query: string, limit?: number }

// Output shape for v2:
{
  repoPath: string,
  terms: string[],
  results: {
    [term: string]: Array<{
      path: string,
      score: number,
      language: string | null,
      importers: string[],      // files that import this file (reverse edges)
      cochangePartners: string[], // top co-change partners with count
      isHub: boolean,           // indegree >= threshold (e.g., >= 5)
      hubScore: number,         // normalized indegree 0-1
      exports: string[],        // exported symbols
      docstring: string,        // first docstring/JSDoc
    }>
  }
}
```

### Anti-Patterns to Avoid

- **Scoring chunk content directly:** Chunk LIKE queries scan millions of chars; metadata rows are tiny — always score metadata
- **Calling engine directly from MCP/CLI:** MCP and CLI are gates; they call `fetch(:4111/grep)` — engine is only called from daemon route handlers
- **Async drizzle in tight loops:** better-sqlite3 is synchronous; drizzle wrapping it is also sync in practice — use `.all()` / `.get()` / `.run()` not `.execute()` which returns a Promise in some drivers
- **Naked exported functions:** Every export in `packages/engine/src/index.ts` must be a `lensFn()` result; grep for `^export (async )?function` in engine src is the verification command
- **Vector/embedding tables in schema:** v2 has no embeddings — strip the `embedding BLOB` column from chunks table vs v1

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| .gitignore respecting file list | Custom gitignore parser | `git ls-files -z` | git handles it natively; handles nested .gitignore, .git/info/exclude, global config |
| Git log parsing | Custom streaming git log parser | `execFile("git", ["log", "--name-only", "--format=%H %aI", ...])`  | v1's `parseGitLog()` is 30 lines, works correctly, handles edge cases |
| Import path resolution | AST traversal (ts-morph) | Regex + path normalization | v1's regex handles TS/JS/Python/Go/Rust with ~100 lines; ts-morph adds 50MB+ deps and TypeScript compiler startup |
| DB migrations | Drizzle-kit generate + migrate | `sqlite.exec(createTablesSql())` — raw CREATE IF NOT EXISTS | For a local-first SQLite app, inline SQL is simpler than migration files; no drizzle-kit runtime needed |
| Concurrent index protection | Queue library | In-memory `Map<repoId, Promise>` mutex | Single-process daemon; no distributed locking needed; v1's 15-line mutex works |

**Key insight:** The import resolution problem looks hard but the v1 regex approach resolves 95%+ of relative imports correctly. Absolute/package imports are intentionally ignored (they're not in the repo). ts-morph solves the remaining 5% but costs ~30x more in startup time and dependency size.

---

## Common Pitfalls

### Pitfall 1: drizzle-orm Version Mismatch Between Packages
**What goes wrong:** `@lens/engine` uses drizzle-orm ^0.45.x but `@lens/core` also has drizzle-orm — pnpm may hoist different versions, causing type incompatibilities between `Db` types.
**Why it happens:** Both packages declare drizzle-orm as a dependency independently.
**How to avoid:** Engine's `Db` type is self-contained (`BetterSQLite3Database<typeof engineSchema>`) — it's a different type from core's trace DB. They should never be mixed. Keep engine and core on the same drizzle version (^0.45.1).
**Warning signs:** TypeScript errors about `BetterSQLite3Database` being non-assignable; tsc complaints about schema types.

### Pitfall 2: better-sqlite3 Sync API in Async Context
**What goes wrong:** Calling synchronous better-sqlite3 methods inside `async` functions that also `await` — blocks the event loop, stalls HTTP requests during indexing.
**Why it happens:** better-sqlite3 is intentionally synchronous; wrapping it in async via `lensFn()` doesn't make it non-blocking.
**How to avoid:** Indexing should be triggered async but the DB writes (in-transaction) are synchronous — this is acceptable for Phase 2. WAL mode on the index DB prevents read/write deadlocks with concurrent HTTP requests. Phase 4 handles worker thread separation.
**Warning signs:** Dashboard polling stalls during active indexing; health endpoint timeouts.

### Pitfall 3: `lensFn()` with Synchronous Inner Functions
**What goes wrong:** `lensFn()` expects an async function — wrapping a sync function in `lensFn()` makes the outer call return a Promise, which callers may not expect.
**Why it happens:** Synchronous engine helpers (chunker, metadata extractor) are often called in loops — the overhead of async is unnecessary.
**How to avoid:** Only wrap top-level exported functions in `lensFn()`. Internal helpers remain synchronous. The public `index.ts` exports are all the wrapped versions.
**Warning signs:** Performance degradation from thousands of unnecessary Promise allocations; tsc errors about sync/async mismatch.

### Pitfall 4: Import Graph Building from Chunk Content vs File Content
**What goes wrong:** Building the import graph by reading individual chunk content strings — duplicate imports get extracted multiple times (one per chunk) and resolveImport paths become inconsistent because chunk content lacks full file context.
**Why it happens:** The chunker splits files into overlapping chunks — the same import statement may appear at the boundary of two chunks.
**How to avoid:** `buildAndPersistImportGraph()` first merges all chunks per file path into a single string (as v1 does), then extracts import specifiers from the merged content. Never call `extractImportSpecifiers()` per-chunk.

### Pitfall 5: Co-Change Analysis on Merge Commits
**What goes wrong:** Including merge commits in co-change analysis inflates pair frequencies — a merge commit touching 50 files creates O(50^2) = 2500 pairs, most meaningless.
**Why it happens:** `git log --no-merges` not included in the git args.
**How to avoid:** Always pass `--no-merges`. Additionally cap: skip commits that touch more than `MAX_FILES_PER_COMMIT` (v1 uses 20). This prevents monorepo root commits from polluting the co-change signal.

### Pitfall 6: Drizzle `skipLibCheck` Requirement
**What goes wrong:** `tsc --noEmit` fails with type errors inside drizzle-orm's own `.d.ts` files.
**Why it happens:** drizzle-orm ^0.45.x ships broken type declarations for gel/mysql2/singlestore dialects (Phase 1 lesson, confirmed in STATE.md).
**How to avoid:** `skipLibCheck: true` must be in every tsconfig that includes drizzle-orm. Already in `tsconfig.base.json`.

### Pitfall 7: Engine DB Path Collision with Trace DB
**What goes wrong:** Both DBs write to the same SQLite file — transactions from the indexer contend with TraceStore flush timer.
**Why it happens:** Both default to `~/.lens/` but use different filenames — if the path is not explicitly configured, they could collide.
**How to avoid:** Engine index DB path: `~/.lens/index.db`. Trace DB path: `~/.lens/traces.db` (already in Phase 1). Never use the same path. Both get WAL mode independently.

### Pitfall 8: `git ls-files` Fails Outside a Git Repo
**What goes wrong:** User passes a non-git directory as repoPath — `git ls-files` exits non-zero, `execFileAsync` throws.
**Why it happens:** No validation before calling git commands.
**How to avoid:** In `registerRepo()` and `runIndex()`, call `getHeadCommit()` first — if it throws, the path is not a valid git repo; surface a clear error to the caller.

---

## Code Examples

### Engine DB Schema (v2, stripped of embeddings)

```typescript
// packages/engine/src/db/schema.ts
// Source: adapted from v1-archive:packages/engine/src/db/schema.ts
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const uuid = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const now = () => text("created_at").notNull().default(sql`(datetime('now'))`);

export const repos = sqliteTable("repos", {
  id: uuid(),
  identity_key: text("identity_key").notNull().unique(),
  name: text("name").notNull(),
  root_path: text("root_path").notNull(),
  remote_url: text("remote_url"),
  last_indexed_commit: text("last_indexed_commit"),
  index_status: text("index_status").notNull().default("pending"),
  last_indexed_at: text("last_indexed_at"),
  last_git_analysis_commit: text("last_git_analysis_commit"),
  max_import_depth: integer("max_import_depth").default(0),
  created_at: now(),
}, (t) => [index("idx_repos_identity").on(t.identity_key)]);

// chunks: stores file content in 150-line windows (for text search only, no embeddings)
export const chunks = sqliteTable("chunks", {
  id: uuid(),
  repo_id: text("repo_id").notNull().references(() => repos.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  chunk_index: integer("chunk_index").notNull(),
  start_line: integer("start_line").notNull(),
  end_line: integer("end_line").notNull(),
  content: text("content").notNull(),
  chunk_hash: text("chunk_hash").notNull(),
  last_seen_commit: text("last_seen_commit").notNull(),
  language: text("language"),
}, (t) => [
  uniqueIndex("idx_chunks_unique").on(t.repo_id, t.path, t.chunk_index, t.chunk_hash),
  index("idx_chunks_repo_path").on(t.repo_id, t.path),
]);

// file_metadata: per-file extracted symbols — TF-IDF scoring operates on this
export const fileMetadata = sqliteTable("file_metadata", {
  id: uuid(),
  repo_id: text("repo_id").notNull().references(() => repos.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  language: text("language"),
  exports: text("exports").default("[]"),  // JSON string[]
  imports: text("imports").default("[]"),  // JSON string[]
  docstring: text("docstring").default(""),
  sections: text("sections").default("[]"),  // JSON string[]
  internals: text("internals").default("[]"), // JSON string[]
}, (t) => [uniqueIndex("idx_file_metadata_unique").on(t.repo_id, t.path)]);

// file_imports: import graph edges — source imports target
export const fileImports = sqliteTable("file_imports", {
  id: uuid(),
  repo_id: text("repo_id").notNull().references(() => repos.id, { onDelete: "cascade" }),
  source_path: text("source_path").notNull(),
  target_path: text("target_path").notNull(),
}, (t) => [
  uniqueIndex("idx_file_imports_unique").on(t.repo_id, t.source_path, t.target_path),
  index("idx_file_imports_target").on(t.repo_id, t.target_path),
  index("idx_file_imports_source").on(t.repo_id, t.source_path),
]);

// file_stats: commit counts per file (hotness signal)
export const fileStats = sqliteTable("file_stats", {
  id: uuid(),
  repo_id: text("repo_id").notNull().references(() => repos.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  commit_count: integer("commit_count").notNull().default(0),
  recent_count: integer("recent_count").notNull().default(0),
  last_modified: text("last_modified"),
}, (t) => [uniqueIndex("idx_file_stats_unique").on(t.repo_id, t.path)]);

// file_cochanges: pairwise co-change frequency
export const fileCochanges = sqliteTable("file_cochanges", {
  id: uuid(),
  repo_id: text("repo_id").notNull().references(() => repos.id, { onDelete: "cascade" }),
  path_a: text("path_a").notNull(),
  path_b: text("path_b").notNull(),
  cochange_count: integer("cochange_count").notNull().default(1),
}, (t) => [
  uniqueIndex("idx_file_cochanges_unique").on(t.repo_id, t.path_a, t.path_b),
  index("idx_cochanges_lookup").on(t.repo_id, t.path_a),
]);
```

### Indexing Pipeline Orchestration

```typescript
// packages/engine/src/index/engine.ts (simplified v2 structure)
export const runIndex = lensFn("engine.runIndex", async (
  db: Db,
  repoId: string,
  force = false,
): Promise<IndexResult> => {
  return withLock(repoId, async () => {
    const repo = repoQueries.getById(db, repoId);
    if (!repo) throw new Error(`repo not found: ${repoId}`);

    const headCommit = await getHeadCommit(repo.root_path);
    if (!force && repo.last_indexed_commit === headCommit) {
      return { files_scanned: 0, chunks_created: 0, duration_ms: 0, skipped: true };
    }

    repoQueries.setIndexing(db, repoId);

    // 1. Discovery
    const isFullScan = force || !repo.last_indexed_commit;
    const files = isFullScan
      ? await fullScan(repo.root_path)
      : await diffScan(repo.root_path, repo.last_indexed_commit!, headCommit);

    // 2. Chunking + storage
    // ... per-file readFile → chunkFile → upsert chunks

    // 3. Metadata extraction (synchronous, operates on merged chunk content)
    extractAndPersistMetadata(db, repoId);

    // 4. Import graph
    buildAndPersistImportGraph(db, repoId);

    // 5. Git co-change analysis
    await analyzeGitHistory(db, repoId, repo.root_path, repo.last_git_analysis_commit);

    repoQueries.updateIndexState(db, repoId, headCommit, "ready");

    return { files_scanned: files.length, chunks_created, duration_ms: Date.now() - start };
  });
});
```

### Composite Scoring (hub detection built-in)

```typescript
// Hub detection is implicit in the indegree boost — no separate "hub detection" pass needed
// A file is a "hub" if its indegree is >= HUB_THRESHOLD

const HUB_THRESHOLD = 5; // files with >= 5 importers are hubs

function computeHubScore(indegree: number, maxIndegree: number): number {
  if (maxIndegree === 0) return 0;
  return Math.min(1, indegree / maxIndegree);
}

// In the scoring function:
const indegree = indegrees.get(file.path) ?? 0;
const isHub = indegree >= HUB_THRESHOLD;
// Boost hub files in scoring:
if (indegree >= 3) {
  score *= 1 + Math.log2(indegree) * 0.1;
}
```

### Daemon Routes (new routes for Phase 2)

```typescript
// apps/daemon/src/routes/repos.ts
export const reposRoutes = new Hono();

// POST /repos — register a repo
reposRoutes.post("/", lensRoute("repos.register", async (c) => {
  const { path, name } = await c.req.json();
  const result = registerRepo(getEngineDb(), path, name);
  return c.json(result, 201);
}));

// GET /repos — list all repos
reposRoutes.get("/", lensRoute("repos.list", async (c) => {
  return c.json(listRepos(getEngineDb()));
}));

// DELETE /repos/:id — remove a repo
reposRoutes.delete("/:id", lensRoute("repos.remove", async (c) => {
  const result = removeRepo(getEngineDb(), c.req.param("id"));
  return c.json(result);
}));

// POST /repos/:id/index — trigger reindex
reposRoutes.post("/:id/index", lensRoute("repos.index", async (c) => {
  const { force = false } = await c.req.json().catch(() => ({}));
  const result = await runIndex(getEngineDb(), c.req.param("id"), force);
  return c.json(result);
}));
```

### lensFn Wrapping Pattern for Engine Exports

```typescript
// packages/engine/src/index.ts — ALL exports must be lensFn-wrapped
export { runIndex, ensureIndexed } from "./index/engine.js";
export { registerRepo, removeRepo, listRepos, getRepoStatus } from "./repo/repo.js";
export { grepRepo } from "./grep/grep.js";
export { configureEngineDb, getEngineDb } from "./db/connection.js";

// Verification command (ENGN-08):
// grep -r "^export (async )?function" packages/engine/src/
// Result should be: 0 matches
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| ts-morph AST for imports | Regex + path normalization | 10x faster startup, no TS compiler dependency |
| Vector embeddings for semantic search | TF-IDF + structural signals only | Deterministic, reproducible, no API keys needed |
| FTS5 full-text search | Metadata-level TF-IDF | Scores files not chunks; 100x less data to process |
| chokidar file watcher | Manual reindex trigger | Simpler architecture; watcher is Phase 4 concern |
| drizzle-kit migrations | Inline `CREATE TABLE IF NOT EXISTS` | No migration runtime needed for local-first SQLite |

**Deprecated/outdated from v1:**
- `embedding BLOB` column on chunks — removed; no vectors in v2
- `vocab_clusters` on repos — removed; too complex for Phase 2 scope
- `purpose` / `purpose_hash` fields — removed; LLM-enriched summaries not in v2
- `usageCounters` and `telemetryEvents` tables — removed; TraceStore in @lens/core handles observability

---

## Open Questions

1. **ts-morph vs regex for import graph (Plan 02-02)**
   - What we know: v1 regex handles TS/JS/Python/Go/Rust correctly; Plan title says "ts-morph"
   - What's unclear: Whether ts-morph provides meaningful improvement over regex for typical repos
   - Recommendation: Use regex approach from v1 (it works). If the planner wants ts-morph, add it as an optional enhancement; don't block on it.

2. **simple-git vs execFile for git log (Plan 02-03)**
   - What we know: v1 execFile approach works and has zero deps; Plan title says "simple-git"
   - What's unclear: Whether simple-git's API justifies the dependency
   - Recommendation: Use execFile (zero deps, proven). simple-git is fine if planner prefers a library API.

3. **Grep result caching**
   - What we know: v1 had an in-memory LRU cache (20 entries, 2-minute TTL)
   - What's unclear: Phase 2 spec doesn't mention caching; ENGN-07 only requires correctness
   - Recommendation: Skip cache in Phase 2; add in Phase 4 hardening if needed.

4. **Engine DB initialization in daemon startup**
   - What we know: `configureEngineDb()` must be called in `apps/daemon/src/index.ts` alongside `configureLensFn()` etc.
   - What's unclear: The exact DB path convention — should it be `~/.lens/index.db`?
   - Recommendation: `~/.lens/index.db` matching the `DATA_DIR` pattern from Phase 1.

---

## Sources

### Primary (HIGH confidence)
- `v1-archive` git tag — complete working implementation of every engine subsystem; all patterns verified by reading actual source code
- `packages/core/src/lens-fn.ts` — current lensFn() implementation (Phase 1 output); interface is locked
- `packages/core/src/lens-route.ts` — current lensRoute() implementation (Phase 1 output)
- `apps/daemon/src/index.ts` — current daemon startup sequence; configureEngineDb() hooks here
- `apps/daemon/src/routes/grep.ts` — existing stub route that Phase 2 replaces

### Secondary (MEDIUM confidence)
- `packages/core/package.json` — confirmed drizzle-orm ^0.45.1, better-sqlite3 ^12.6.2 versions
- `.planning/STATE.md` — confirmed prior decisions: skipLibCheck, configure*() pattern, two-DB architecture
- `.planning/ROADMAP.md` — confirmed plan breakdown and success criteria

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against working v1 implementation and current package.json
- Architecture: HIGH — direct port of v1 with lensFn() substitution; all patterns confirmed
- Pitfalls: HIGH — each pitfall either observed in v1 source or documented in STATE.md as prior decision
- Composite scoring formula: HIGH — read directly from v1 `query-interpreter.ts` source

**Research date:** 2026-02-19
**Valid until:** Stable architecture; valid until Phase 2 plans complete (no external dependencies to go stale)
