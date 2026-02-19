---
phase: 02-intelligence-engine
plan: "01"
subsystem: database
tags: [better-sqlite3, drizzle-orm, sqlite, git, chunking, metadata]

# Dependency graph
requires:
  - phase: 01-core-daemon-mcp
    provides: lensFn wrapper, Logger, TraceStore, @lens/core package
provides:
  - Engine SQLite DB with WAL mode, drizzle-orm schema, migrate() initialization
  - 6 Drizzle tables: repos, chunks, fileMetadata, fileImports, fileStats, fileCochanges
  - Typed query helpers: repoQueries, chunkQueries, metadataQueries, importQueries, statsQueries, cochangeQueries
  - File discovery via git ls-files -z (respects .gitignore natively)
  - Content chunker: boundary-aware 150-line windows with 20-line overlap and SHA-256 hashes
  - Metadata extraction: exports, imports, docstring, sections, internals
  - Repo registration/management: registerRepo(), removeRepo(), listRepos(), getRepoStatus()
  - Identity key derivation via SHA-256 of normalized remote URL or root path
affects: [02-02-scoring, 02-03-import-graph, 02-04-barrel, 02-05-git-analysis, daemon-repo-routes]

# Tech tracking
tech-stack:
  added: [better-sqlite3@12.6.2, drizzle-orm@0.45.1, drizzle-kit@0.31.9]
  patterns:
    - configureEngineDb() singleton — set once at startup, matches core's configure*() pattern
    - Drizzle migrate() — migration files in packages/engine/drizzle/, not inline SQL
    - lensFn wrapping on registerRepo() — only public async functions get tracing
    - git ls-files -z for file discovery — null-terminated, 50MB buffer, respects .gitignore
    - Boundary-aware chunking — prefer blank lines, fall back to declaration boundaries

key-files:
  created:
    - packages/engine/src/db/connection.ts
    - packages/engine/src/db/schema.ts
    - packages/engine/src/db/queries.ts
    - packages/engine/src/index/discovery.ts
    - packages/engine/src/index/chunker.ts
    - packages/engine/src/index/extract-metadata.ts
    - packages/engine/src/repo/identity.ts
    - packages/engine/src/repo/repo.ts
    - packages/engine/drizzle.config.ts
    - packages/engine/drizzle/0000_robust_lethal_legion.sql
  modified:
    - packages/engine/package.json
    - packages/engine/tsconfig.json
    - packages/engine/tsup.config.ts
    - packages/engine/src/index.ts

key-decisions:
  - "Drizzle migrate() not inline SQL — connection.ts calls migrate() from drizzle-orm/better-sqlite3/migrator, migration in drizzle/ folder"
  - "skipLibCheck required — drizzle-orm 0.45.1 ships broken .d.ts for gel/mysql2/singlestore adapters"
  - "ESM-only tsup with createRequire banner — better-sqlite3 is native CJS addon, needs polyfill in ESM context"
  - "lensFn only on registerRepo() — sync internal helpers (chunker, metadata, identity) are not lensFn-wrapped per plan spec"
  - "drizzle migration path computed relative to __filename with CJS compat guard — import.meta.url is {} in tsup CJS builds"

patterns-established:
  - "configureEngineDb(): Drizzle singleton with WAL+busy_timeout+foreign_keys pragmas"
  - "migrate() path: join(_dirname, '..', 'drizzle') — one level up from src/ to package root"
  - "chunkFile(): CHUNK_SIZE=150, OVERLAP=20, findBoundary() prefers blank lines then declaration keywords"
  - "extractFileMetadata(): language-aware regex dispatch for exports/imports/docstring/sections/internals"
  - "deriveIdentityKey(): normalizeRemoteUrl() handles SSH and HTTPS, strips .git suffix"

requirements-completed: [ENGN-01, DAEM-05]

# Metrics
duration: 7min
completed: 2026-02-19
---

# Phase 02 Plan 01: Engine Foundation Summary

**Drizzle SQLite schema (6 tables), git ls-files discovery, boundary-aware chunker, regex metadata extraction, and repo CRUD with identity-key-based idempotency**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-19T21:02:08Z
- **Completed:** 2026-02-19T21:09:00Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Engine SQLite DB layer: configureEngineDb() with WAL mode, busy_timeout=5000, foreign_keys=ON, Drizzle migrate()
- 6-table schema: repos, chunks, fileMetadata, fileImports, fileStats, fileCochanges — all with FK cascade and composite indexes
- Typed query helpers for all 6 tables covering full CRUD, upsert patterns, and transactional batch writes
- File discovery via `git ls-files -z` — inherits .gitignore natively, language detection via extension map, 2MB cap
- Boundary-aware chunker: 150-line windows, 20-line overlap, prefers blank line boundaries over hard cuts
- Multi-language metadata extraction: exports/imports/docstring/sections/internals via language-specific regex
- Repo management: registerRepo() validates git repo, derives SHA-256 identity key, idempotent upsert; removeRepo() cascades

## Task Commits

Each task was committed atomically:

1. **Task 1: Engine package scaffold + DB layer** - `373c9e7` (feat)
2. **Task 2: File discovery, chunker, metadata extraction, repo management** - `dab3b3a` (feat)
3. **Fix: Switch engine DB init to drizzle migrate()** - `1295003` (fix — committed separately per important_context deviation)

## Files Created/Modified
- `packages/engine/package.json` - Added better-sqlite3, drizzle-orm, drizzle-kit deps; build/typecheck scripts
- `packages/engine/tsconfig.json` - ES2022/NodeNext, skipLibCheck for drizzle-orm broken .d.ts
- `packages/engine/tsup.config.ts` - ESM-only, external @lens/core, createRequire CJS compat banner
- `packages/engine/src/db/connection.ts` - configureEngineDb(), getEngineDb(), Db type; migrate() from drizzle/ folder
- `packages/engine/src/db/schema.ts` - 6 sqliteTable definitions with indexes and FK cascades
- `packages/engine/src/db/queries.ts` - repoQueries, chunkQueries, metadataQueries, importQueries, statsQueries, cochangeQueries
- `packages/engine/src/index/discovery.ts` - fullScan(), diffScan(), getHeadCommit(), detectLanguage(), isBinaryExt()
- `packages/engine/src/index/chunker.ts` - chunkFile() with findBoundary(), SHA-256 via createHash
- `packages/engine/src/index/extract-metadata.ts` - extractFileMetadata(), extractAndPersistMetadata()
- `packages/engine/src/repo/identity.ts` - deriveIdentityKey() with normalizeRemoteUrl()
- `packages/engine/src/repo/repo.ts` - registerRepo() (lensFn), removeRepo(), listRepos(), getRepoStatus()
- `packages/engine/drizzle.config.ts` - drizzle-kit config
- `packages/engine/drizzle/0000_robust_lethal_legion.sql` - generated migration for all 6 tables
- `packages/engine/src/index.ts` - minimal barrel exporting configureEngineDb, getEngineDb, Db type

## Decisions Made
- Drizzle migrate() instead of inline CREATE TABLE IF NOT EXISTS SQL — matches @lens/core pattern, keeps schema as single source of truth in schema.ts with migration file generated by drizzle-kit
- skipLibCheck: drizzle-orm 0.45.1 has broken .d.ts for unused adapters; same decision as Phase 1
- createRequire banner in tsup: better-sqlite3 is native CJS addon, must polyfill require() in ESM output
- Only registerRepo() gets lensFn() wrapping — sync internal helpers (chunker, metadata, identity) are not wrapped per plan spec (called from lensFn-wrapped orchestrators)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Drizzle migrate() replaces inline CREATE TABLE SQL**
- **Found during:** Task 1 (engine package scaffold + DB layer) — per important_context in execution brief
- **Issue:** Plan.md specified inline `CREATE TABLE IF NOT EXISTS` SQL in connection.ts. User explicitly decided to use Drizzle migrations instead to match @lens/core pattern and keep schema.ts as single source of truth.
- **Fix:** connection.ts uses `migrate()` from `drizzle-orm/better-sqlite3/migrator`. Added `drizzle.config.ts` and generated migration `drizzle/0000_robust_lethal_legion.sql` via drizzle-kit.
- **Files modified:** `packages/engine/src/db/connection.ts`, `packages/engine/drizzle.config.ts`, `packages/engine/drizzle/0000_robust_lethal_legion.sql`, `packages/engine/drizzle/meta/`
- **Verification:** Build passes, typecheck passes.
- **Committed in:** `1295003` (fix commit)

---

**Total deviations:** 1 (architectural direction pre-specified by user, not an auto-fix)
**Impact on plan:** Zero — schema tables are identical, behavior is equivalent, migration approach is more maintainable.

## Issues Encountered
None — build and typecheck clean on first attempt.

## Next Phase Readiness
- Engine DB foundation complete — all 6 tables, queries, and migrations ready
- discovery.ts, chunker.ts, extract-metadata.ts available for Plan 02-02 (scoring/indexing pipeline)
- Repo CRUD ready for daemon routes in DAEM-05
- drizzle migration folder established — future schema changes add new migration files

---
*Phase: 02-intelligence-engine*
*Completed: 2026-02-19*

## Self-Check: PASSED

All key files found. All commits verified:
- `373c9e7` FOUND
- `dab3b3a` FOUND
- `1295003` FOUND
