---
phase: 02-intelligence-engine
plan: "03"
subsystem: index-orchestrator-scorer
tags: [indexing, mutex, tfidf, scoring, hub-detection, structural-signals]

# Dependency graph
requires:
  - phase: 02-01
    provides: Engine DB (repos, chunks, fileMetadata, fileStats, fileCochanges tables), all query modules
  - phase: 02-02
    provides: buildAndPersistImportGraph(), analyzeGitHistory(), extractAndPersistMetadata()
provides:
  - runIndex(): full indexing pipeline orchestrator with in-memory mutex
  - interpretQuery(): TF-IDF + structural composite scorer
  - getIndegrees(): per-file import indegree counts
  - getReverseImports(): files that import a given target
  - getCochangePartners(): top co-change partners for a file
  - getFileStats(): per-file commit stats (commitCount, recentCount)
affects: [02-04-grep-route, daemon-index-routes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "In-memory mutex via Map<repoId, Promise<void>> — withLock() pattern from plan spec"
    - "lensFn wraps async runIndex() — all engine top-level exports follow this pattern"
    - "TF-IDF with per-field weights: fileName(4x), exports(2.5x), internals(1.5x), dirPath(2x), docstring/sections(1x)"
    - "IDF = min(10, max(1, log(N/df))) — bounded to prevent extreme values on rare/common terms"
    - "Structural boosters layered after TF-IDF base: hotness, indegree, hub dampening, multi-term coverage"
    - "decomposeTokens() splits camelCase/PascalCase/snake_case/kebab-case for precise export token matching"
    - "Bidirectional co-change query: OR(path_a = X, path_b = X) — pairs stored with lex ordering"

key-files:
  created:
    - packages/engine/src/index/engine.ts
    - packages/engine/src/grep/scorer.ts
    - packages/engine/src/grep/structural.ts

key-decisions:
  - "runIndex() early-exits on unchanged HEAD — skipped: true return, no status transition to indexing"
  - "diffScan uses last_indexed_commit as from-commit — plan spec, avoids re-scanning unchanged files"
  - "structural.ts helpers are NOT lensFn-wrapped — internal query helpers, called from lensFn-wrapped orchestrators"
  - "interpretQuery() is NOT lensFn-wrapped — called from grepRepo() which will be wrapped in 02-04"
  - "getCochangePartners() queries both directions (OR) — fileCochanges stores only lex-ordered pairs (path_a < path_b)"
  - "Hub dampening: exports > 5 → score *= 1/(1 + log2(exports/5) * 0.3) — prevents barrel files dominating"

requirements-completed: [ENGN-02, ENGN-05, ENGN-06]

# Metrics
duration: 2min
completed: 2026-02-19
---

# Phase 02 Plan 03: Index Orchestrator + Composite Scoring Summary

**runIndex() pipeline orchestrator with mutex locking, and TF-IDF composite scorer with indegree/hotness/hub structural signals**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-19T08:19:34Z
- **Completed:** 2026-02-19T08:21:55Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments

- `engine.ts`: `runIndex()` wrapped in `lensFn("engine.runIndex")` — full pipeline: discovery → chunking → metadata extraction → import graph → git analysis → status update. `withLock()` mutex prevents concurrent same-repo indexing while allowing parallel indexing of different repos. Early exit when HEAD unchanged (unless `force=true`). Status transitions: pending → indexing → ready.
- `structural.ts`: `getIndegrees()` — SQL `GROUP BY target_path COUNT(*)` on fileImports; `getReverseImports()` — delegates to `importQueries.getImporters()`; `getCochangePartners()` — bidirectional OR query (path_a OR path_b) returning the partner path and co-change count; `getFileStats()` — commitCount + recentCount per file. All synchronous via better-sqlite3.
- `scorer.ts`: `interpretQuery()` — TF-IDF over all fileMetadata fields with per-field weights (fileName 4x, exports 2.5x, internals 1.5x, dirPath 2x, docstring/sections 1x). IDF = `min(10, max(1, log(N/df)))`. Structural boosters: hotness (`recentCount * 0.5`, cap 5), indegree boost (`score *= 1 + log2(indegree) * 0.1` when indegree >= 3), hub dampening (`score *= 1/(1+log2(exports/5)*0.3)` when exports > 5), multi-term coverage (`score *= 1 + coverage^2`). Hub detection: `isHub = indegree >= 5`. `hubScore = indegree / maxIndegree` (normalized 0-1).

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Index orchestrator with mutex | `78b6439` | engine.ts (new) |
| 2 | TF-IDF scorer, structural queries, hub detection | `0a36ae5` | scorer.ts (new), structural.ts (new) |

## Files Created/Modified

- `packages/engine/src/index/engine.ts` — `runIndex()`, `withLock()`, `IndexResult` type
- `packages/engine/src/grep/structural.ts` — `getIndegrees()`, `getReverseImports()`, `getCochangePartners()`, `getFileStats()`
- `packages/engine/src/grep/scorer.ts` — `interpretQuery()`, `ScoredFile` type, `decomposeTokens()`, field weights, IDF, structural boosters

## Decisions Made

- `runIndex()` early-exits with `skipped: true` when HEAD unchanged — no status transition to "indexing", clean no-op
- `diffScan` uses `repo.last_indexed_commit` as from-commit — incremental scanning matches plan spec
- Structural query helpers intentionally NOT `lensFn`-wrapped — internal helpers called synchronously from already-traced orchestrators
- `interpretQuery()` NOT `lensFn`-wrapped — will be called from `grepRepo()` in Plan 02-04 which will be the lensFn boundary
- `getCochangePartners()` queries both `path_a = X OR path_b = X` — required because fileCochanges stores only lexicographically ordered pairs
- Hub dampening targets barrel files: `exports > 5` threshold, logarithmic dampening prevents total suppression

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — build and typecheck clean on first attempt for both tasks.

## Next Phase Readiness

- `runIndex()` ready for daemon integration in Plan 02-04 (grep route will call both `runIndex` and `interpretQuery`)
- `interpretQuery()` ready to be called from `grepRepo()` in Plan 02-04
- All three files (`engine.ts`, `scorer.ts`, `structural.ts`) build and typecheck clean
- Requirements ENGN-02, ENGN-05, ENGN-06 satisfied

---
*Phase: 02-intelligence-engine*
*Completed: 2026-02-19*

## Self-Check: PASSED

All key files found. All commits verified:
- `78b6439` FOUND
- `0a36ae5` FOUND
