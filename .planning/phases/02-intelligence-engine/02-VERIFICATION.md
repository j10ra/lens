---
phase: 02-intelligence-engine
verified: 2026-02-20T00:00:00Z
status: passed
score: 10/10 must-haves verified
re_verification: false
---

# Phase 02: Intelligence Engine Verification Report

**Phase Goal:** A repo can be indexed and queried — structural context (callers, importers, co-change partners, hub score) returned for any search term
**Verified:** 2026-02-20
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Engine DB opens at `~/.lens/index.db` with WAL mode, busy_timeout, foreign_keys | VERIFIED | `connection.ts:19-22` — `pragma journal_mode = WAL`, `pragma busy_timeout = 5000`, `pragma foreign_keys = ON`; migrate() applies Drizzle schema |
| 2 | `fullScan()` returns files respecting .gitignore via `git ls-files -z` | VERIFIED | `discovery.ts:101` — `execFileAsync("git", ["ls-files", "-z"], { cwd: repoRoot, maxBuffer: 50*1024*1024 })`; binary/size filters applied |
| 3 | `chunkFile()` splits file content into overlapping 150-line windows with SHA-256 hashes | VERIFIED | `chunker.ts` — `CHUNK_SIZE=150`, `OVERLAP=20`, `findBoundary()` with blank-line preference, `createHash("sha256")` per chunk |
| 4 | `extractFileMetadata()` extracts exports, imports, docstring, sections, internals | VERIFIED | `extract-metadata.ts:244-256` — language-aware regex dispatch for all 5 fields |
| 5 | `registerRepo()` creates repo row with identity_key derived from remote URL or root path | VERIFIED | `repo.ts:23-41` — `deriveIdentityKey()` via SHA-256 of normalized remote URL or root path; idempotent upsert; git validation via `getHeadCommit()` |
| 6 | `runIndex()` orchestrates: discovery → chunking → metadata → import graph → git analysis with mutex | VERIFIED | `engine.ts:43-121` — `withLock(repoId, ...)`, full pipeline wired, early-exit on unchanged HEAD |
| 7 | `interpretQuery()` computes TF-IDF over fileMetadata with per-field weights and structural boosters | VERIFIED | `scorer.ts:64-192` — field weights (fileName=4x, dirPath=2x, exports=2.5x), IDF formula, hotness/indegree/hub-dampening/multi-term boosters |
| 8 | `grepRepo()` returns per-term results enriched with importers, cochangePartners, isHub, hubScore, exports, docstring | VERIFIED | `grep.ts:38-81` — pipe-split terms, `interpretQuery()` scoring, `getReverseImports()` + `getCochangePartners()` enrichment, grouped by term |
| 9 | Every exported function in `packages/engine/src/index.ts` is wrapped in `lensFn()` | VERIFIED | `index.ts` — 11 `lensFn` usages; `grep -E "^export (async )?function" src/index.ts` returns 0 matches |
| 10 | POST /grep calls real `grepRepo()` from `@lens/engine` (not stub); repo CRUD endpoints exist | VERIFIED | `routes/grep.ts:36` — `await grepRepo(db, repo.id, query, limit)`; `routes/repos.ts` — POST/GET/DELETE/POST-index all wired with `lensRoute()` |

**Score:** 10/10 truths verified

---

## Required Artifacts

### Plan 02-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/engine/src/db/connection.ts` | `configureEngineDb()`, `getEngineDb()`, `Db` type | VERIFIED | WAL/busy_timeout/foreign_keys pragmas; Drizzle migrate() from drizzle/ folder; singleton pattern |
| `packages/engine/src/db/schema.ts` | 6 Drizzle tables with FK cascades and indexes | VERIFIED | repos, chunks, fileMetadata, fileImports, fileStats, fileCochanges — all with composite indexes and `onDelete: "cascade"` |
| `packages/engine/src/db/queries.ts` | `repoQueries`, `chunkQueries`, `metadataQueries`, `importQueries`, `statsQueries`, `cochangeQueries` | VERIFIED | All 6 query groups present with full CRUD, upsert, and transactional batch operations |
| `packages/engine/src/index/discovery.ts` | `fullScan()`, `diffScan()`, `getHeadCommit()` | VERIFIED | git ls-files -z, language map, binary ext filter, 2MB cap |
| `packages/engine/src/index/chunker.ts` | `chunkFile()` — boundary-aware splitting | VERIFIED | 150-line windows, 20-line overlap, blank-line boundary preference, SHA-256 per chunk |
| `packages/engine/src/index/extract-metadata.ts` | `extractFileMetadata()`, `extractAndPersistMetadata()` | VERIFIED | Language-aware export/import/docstring/sections/internals extraction; chunks merged before extraction |
| `packages/engine/src/repo/identity.ts` | `deriveIdentityKey()` | VERIFIED | SHA-256 of normalized remote URL (SSH/HTTPS handled) or root path |
| `packages/engine/src/repo/repo.ts` | `registerRepo()`, `removeRepo()`, `listRepos()`, `getRepoStatus()` | VERIFIED | `registerRepo` wrapped in `lensFn`; sync helpers are plain functions wrapped at barrel level |

### Plan 02-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/engine/src/index/imports.ts` | `extractImportSpecifiers()`, `resolveImport()` | VERIFIED | TS/JS/Python/Go/Rust regex patterns; relative-only filtering; extension-trying resolution |
| `packages/engine/src/index/import-graph.ts` | `buildAndPersistImportGraph()` | VERIFIED | Clears old edges; merges chunks per file before extraction (anti-chunk-split pattern); deduplicates; persists via `importQueries.insertEdges()` |
| `packages/engine/src/index/git-analysis.ts` | `analyzeGitHistory()` | VERIFIED | `--no-merges`, `MAX_FILES_PER_COMMIT=20`, `MIN_COCHANGE_THRESHOLD=2`, `RECENT_DAYS=90`; persists stats and co-change pairs; stores HEAD commit for incremental analysis |

### Plan 02-03 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/engine/src/index/engine.ts` | `runIndex()` with mutex | VERIFIED | `withLock()` in-memory mutex; `lensFn("engine.runIndex", ...)` wrapping; full 9-step pipeline |
| `packages/engine/src/grep/scorer.ts` | `interpretQuery()` — TF-IDF + structural boosters | VERIFIED | `HUB_THRESHOLD=5`, field weights, IDF formula, hotness/indegree/hub-dampening boosters, `ScoredFile` type with `isHub`, `hubScore` |
| `packages/engine/src/grep/structural.ts` | `getIndegrees()`, `getReverseImports()`, `getCochangePartners()` | VERIFIED | `getCochangePartners()` correctly queries BOTH `path_a` AND `path_b` directions via `or()` — proper bidirectional lookup |

### Plan 02-04 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/engine/src/grep/grep.ts` | `grepRepoImpl()` — structural grep | VERIFIED | Pipe-split terms; scores via `interpretQuery()`; enriches with `getReverseImports()`, `getCochangePartners(5)`, exports, docstring |
| `packages/engine/src/index.ts` | Public barrel with all exports wrapped in `lensFn()` | VERIFIED | 11 `lensFn` calls; 0 `export function` in barrel; type re-exports for `GrepResult`, `EnrichedMatch`, `IndexResult`, `RepoRecord` |

### Plan 02-05 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/daemon/src/routes/repos.ts` | POST /, GET /, DELETE /:id, POST /:id/index — all `lensRoute`-wrapped | VERIFIED | All 4 routes wrapped; 201 for register, 200 for list, 404 for missing, IndexResult returned |
| `apps/daemon/src/routes/grep.ts` | Real `grepRepo()` call, not stub | VERIFIED | Imports from `@lens/engine`; resolves repoPath→repoId; 404 for unregistered, 409 for not-indexed |
| `apps/daemon/src/http.ts` | `/repos` mounted | VERIFIED | `app.route("/repos", reposRoutes)` at line 19 |
| `apps/daemon/src/index.ts` | `configureEngineDb(INDEX_DB)` at startup | VERIFIED | Called after configure* calls, before `startHttpServer()` at line 25 |

---

## Key Link Verification

### Plan 02-01 Links

| From | To | Via | Status |
|------|----|-----|--------|
| `db/connection.ts` | `db/schema.ts` | `import * as schema` + `drizzle(sqlite, { schema })` | WIRED |
| `repo/repo.ts` | `db/queries.ts` | `repoQueries.insert/getByIdentityKey/getAll/remove/getById` | WIRED |

### Plan 02-02 Links

| From | To | Via | Status |
|------|----|-----|--------|
| `index/import-graph.ts` | `index/imports.ts` | `extractImportSpecifiers()` + `resolveImport()` | WIRED |
| `index/import-graph.ts` | `db/queries.ts` | `importQueries.clearForRepo()` + `importQueries.insertEdges()` | WIRED |
| `index/git-analysis.ts` | `db/queries.ts` | `statsQueries.upsertStats()` + `cochangeQueries.upsertPairs()` + `repoQueries.updateGitAnalysisCommit()` | WIRED |

### Plan 02-03 Links

| From | To | Via | Status |
|------|----|-----|--------|
| `index/engine.ts` | `index/discovery.ts` | `fullScan()` / `diffScan()` calls | WIRED |
| `index/engine.ts` | `index/import-graph.ts` | `buildAndPersistImportGraph()` call | WIRED |
| `index/engine.ts` | `index/git-analysis.ts` | `analyzeGitHistory()` call | WIRED |
| `grep/scorer.ts` | `grep/structural.ts` | `getIndegrees()` + `getFileStats()` | WIRED |

### Plan 02-04 Links

| From | To | Via | Status |
|------|----|-----|--------|
| `grep/grep.ts` | `grep/scorer.ts` | `interpretQuery()` call | WIRED |
| `grep/grep.ts` | `grep/structural.ts` | `getReverseImports()` + `getCochangePartners()` | WIRED |
| `index.ts` | `grep/grep.ts` | `grepRepo = lensFn("engine.grepRepo", grepRepoImpl)` | WIRED |

### Plan 02-05 Links

| From | To | Via | Status |
|------|----|-----|--------|
| `routes/repos.ts` | `@lens/engine` | `registerRepo`, `removeRepo`, `listRepos`, `runIndex` imports | WIRED |
| `routes/grep.ts` | `@lens/engine` | `grepRepo`, `listRepos`, `getEngineDb` imports | WIRED |
| `index.ts` (daemon) | `@lens/engine` | `configureEngineDb(INDEX_DB)` | WIRED |
| `http.ts` (daemon) | `routes/repos.ts` | `app.route("/repos", reposRoutes)` | WIRED |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ENGN-01 | 02-01 | File discovery scans repo, respects .gitignore, detects file types | SATISFIED | `discovery.ts` — `git ls-files -z`, language map, binary/size filter |
| ENGN-02 | 02-03 | TF-IDF scoring computes term relevance across indexed files | SATISFIED | `scorer.ts:64-192` — IDF formula + per-field weights |
| ENGN-03 | 02-02 | Import graph construction extracts import/export edges from TS/JS files | SATISFIED | `imports.ts` + `import-graph.ts` — regex patterns for TS/JS/Python/Go/Rust |
| ENGN-04 | 02-02 | Co-change analysis parses git log to identify files that change together | SATISFIED | `git-analysis.ts` — `--no-merges`, MAX_FILES_PER_COMMIT=20, MIN_COCHANGE_THRESHOLD=2 |
| ENGN-05 | 02-03 | Hub file detection identifies high-connectivity files | SATISFIED | `scorer.ts:176` — `isHub = indegree >= HUB_THRESHOLD (5)`; `hubScore = indegree/maxIndegree` |
| ENGN-06 | 02-03 | Composite scoring combines TF-IDF, import graph, co-change, hub signals | SATISFIED | `scorer.ts` — hotness boost, indegree multiplier, hub dampening, multi-term coverage |
| ENGN-07 | 02-04 | `lens grep "foo\|bar\|baz"` returns matches per term enriched with structural metadata | SATISFIED | `grep.ts:38-81` — pipe-split, per-term grouping, importers/cochangePartners/isHub/hubScore/exports/docstring |
| ENGN-08 | 02-04 | Every engine function wrapped in `lensFn()` — no naked exports | SATISFIED | `index.ts` — 11 lensFn calls; `grep -E "^export (async )?function" src/index.ts` returns 0 |
| DAEM-05 | 02-01, 02-05 | Repo registration and management (add/remove/list repos) | SATISFIED | `routes/repos.ts` — POST /repos (201), GET /repos (200), DELETE /repos/:id (404 or 200) |
| DAEM-06 | 02-05 | Index trigger endpoint (manual reindex) | SATISFIED | `routes/repos.ts:44-60` — POST /repos/:id/index → `runIndex(getEngineDb(), id, force)` |

**Orphaned requirements:** None — all 10 IDs accounted for.

---

## Anti-Patterns Found

None. Scanned all phase 02 files for:
- TODO/FIXME/PLACEHOLDER/XXX comments — 0 found
- Stub returns (`return null`, `return {}`, `return []` as stubs) — only legitimate guard clauses found (empty-input guards, JSON parse fallbacks)
- Console.log usage — 0 found (all logging via stderr/Logger)
- Empty handlers — 0 found

Notable observations (info only, not blockers):
- `cochangeQueries.getPartners()` in `queries.ts` only queries `path_a` direction. However, `structural.ts:getCochangePartners()` correctly bypasses this and queries both directions via Drizzle `or()` directly. No bug — the queries.ts helper is simply unused in the bidirectional case.

---

## Human Verification Required

### 1. End-to-End Index and Query Flow

**Test:** Start daemon (`LENS_MCP=false node apps/daemon/dist/index.js`), register this repo (`POST /repos { "path": "/Volumes/Drive/__x/RLM" }`), trigger index (`POST /repos/:id/index`), grep for a known term (`POST /grep { "repoPath": "...", "query": "lensFn|lensRoute" }`).
**Expected:** IndexResult with `files_scanned > 0`, grep result with `importers`, `cochangePartners`, `isHub`, `hubScore` populated for core files.
**Why human:** Requires running the daemon process and verifying JSON structure of real output.

### 2. MCP Tool Structural Results

**Test:** With daemon running, invoke `lens_grep` via Claude with query `lensFn|lensRoute`.
**Expected:** Results show actual file paths with non-empty `importers` arrays and meaningful `hubScore` values for high-connectivity files like `packages/core/src/index.ts`.
**Why human:** MCP transport requires interactive MCP client session to verify end-to-end.

### 3. Incremental Indexing on Second Run

**Test:** After initial index succeeds, trigger `POST /repos/:id/index` again (without force).
**Expected:** Response returns `{ "skipped": true, "files_scanned": 0 }` because HEAD commit matches `last_indexed_commit`.
**Why human:** Requires two sequential API calls and state inspection.

---

## Gaps Summary

No gaps. All 10 must-have truths verified at all three levels (exists, substantive, wired).

The phase goal — "a repo can be indexed and queried; structural context (callers, importers, co-change partners, hub score) returned for any search term" — is fully achieved:

1. **Indexing pipeline** is complete: `fullScan()` discovers files respecting .gitignore, `chunkFile()` produces overlapping 150-line windows, `extractFileMetadata()` extracts structural metadata, `buildAndPersistImportGraph()` resolves import edges, `analyzeGitHistory()` computes co-change pairs — all orchestrated by `runIndex()` with mutex safety.

2. **Query pipeline** is complete: `interpretQuery()` scores files with TF-IDF + structural boosters, `grepRepo()` enriches results with importers, co-change partners, hub status, exports, and docstring — grouped per pipe-separated query term.

3. **HTTP API** is complete: daemon exposes `/repos` CRUD and `/grep` with real engine results. MCP `lens_grep` tool inherits real results without code changes.

4. **ENGN-08 compliance** is verified: `grep -E "^export (async )?function" packages/engine/src/index.ts` returns 0 matches; all 6 public engine operations are `lensFn`-wrapped.

---

_Verified: 2026-02-20_
_Verifier: Claude (gsd-verifier)_
