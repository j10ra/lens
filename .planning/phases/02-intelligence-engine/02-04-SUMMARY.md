---
phase: 02-intelligence-engine
plan: "04"
subsystem: grep-engine-barrel
tags: [grep, lensFn, tfidf, structural-signals, barrel, engn-08]

# Dependency graph
requires:
  - phase: 02-03
    provides: interpretQuery() TF-IDF scorer, getReverseImports(), getCochangePartners(), runIndex() orchestrator
  - phase: 02-01
    provides: Engine DB connection, repoQueries, metadataQueries, fileCochanges/fileImports tables
provides:
  - grepRepo(): top-level grep entry point — pipe-separated query, per-term enriched results
  - index.ts: public barrel — all engine exports wrapped in lensFn(), ENGN-08 compliant
affects: [daemon-grep-routes, daemon-index-routes, 02-05-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Re-export already-lensFn-wrapped const exports (runIndex, registerRepo) directly from barrel"
    - "Wrap sync repo functions inline in barrel with async lambda: lensFn('engine.X', async (...args) => syncFn(...args))"
    - "grepRepoImpl naming convention: raw Impl suffix in source, wrapped as grepRepo in barrel"
    - "Pipe-separated multi-term query splitting: query.split('|').map(t => t.trim()).filter(Boolean)"
    - "Term grouping via matchedTerms: files appear under each term they match, no re-scoring"

key-files:
  created:
    - packages/engine/src/grep/grep.ts
  modified:
    - packages/engine/src/index.ts

key-decisions:
  - "Option 1 for barrel wrapping: re-export already-wrapped runIndex/registerRepo as-is, only wrap the unwrapped sync functions (removeRepo, listRepos, getRepoStatus) inline in barrel"
  - "configureEngineDb/getEngineDb not lensFn-wrapped — infra functions, not engine operations"
  - "sync repo functions wrapped with async lambda in barrel (not source) — avoids touching working code"
  - "grepRepo result grouping uses matchedTerms from scorer — no second pass over DB, just filter"
  - "RepoRecord type re-exported from barrel — consumers need it for listRepos/getRepoStatus return type"

patterns-established:
  - "ENGN-08 pattern: barrel index.ts has zero naked export functions, all engine ops go through lensFn"

requirements-completed: [ENGN-07, ENGN-08]

# Metrics
duration: 2min
completed: 2026-02-19
---

# Phase 02 Plan 04: Grep Engine + Public Barrel Summary

**grepRepo() per-term structural grep with importers/co-change/hub enrichment, and lensFn-wrapped public barrel satisfying ENGN-08**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-19T11:07:14Z
- **Completed:** 2026-02-19T11:08:48Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 updated)

## Accomplishments

- `grep.ts`: `grepRepoImpl()` — splits pipe-separated query into terms, scores via `interpretQuery()`, enriches each `ScoredFile` with `importers` (via `getReverseImports()`), `cochangePartners` (via `getCochangePartners()`, top 5), `isHub`, `hubScore`, `exports` and `docstring` (parsed from `fileMetadata`). Groups results per term using `matchedTerms` from scoring — files matching multiple terms appear under each matched term with no re-scoring pass.
- `index.ts`: Public barrel with full ENGN-08 compliance. Re-exports `runIndex` and `registerRepo` as-is (already `lensFn`-wrapped `export const` in source). Wraps `removeRepo`, `listRepos`, `getRepoStatus` inline with `async` lambdas so `lensFn` can trace them. Wraps `grepRepoImpl` as `grepRepo`. Exports `configureEngineDb`, `getEngineDb` unwrapped (infra, not engine ops). Type exports: `Db`, `GrepResult`, `EnrichedMatch`, `IndexResult`, `RepoRecord`.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | grepRepo() structural grep with enrichment | `2b1b7e9` | grep.ts (new) |
| 2 | Public barrel with lensFn wrapping (ENGN-08) | `78fe066` | index.ts (updated) |

## Files Created/Modified

- `packages/engine/src/grep/grep.ts` — `grepRepoImpl()`, `GrepResult` type, `EnrichedMatch` type, `safeJsonParse()`
- `packages/engine/src/index.ts` — Full public barrel: 6 engine exports, 2 infra exports, 5 type exports

## Decisions Made

- Option 1 for barrel wrapping strategy: re-export already-lensFn-wrapped functions (`runIndex`, `registerRepo`) directly, wrap only the three sync repo functions inline in the barrel. This avoids touching working code and keeps source files clean.
- `configureEngineDb` and `getEngineDb` exported without `lensFn` — they are initialization infrastructure, not query operations; wrapping them in traces would be misleading.
- `RepoRecord` type added to barrel exports — daemon routes need the type for typed return values from `listRepos` / `getRepoStatus`.

## Deviations from Plan

None — plan executed exactly as written.

The `important_context` note from the executor prompt correctly identified that `grep.ts` already existed from a prior session with `grepRepoImpl` implemented. Task 1 was verified (build + typecheck + enrichment field grep) and committed atomically, then Task 2 proceeded. No rework needed.

## Issues Encountered

None — build and typecheck clean on first attempt for both tasks.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `grepRepo()` ready for daemon HTTP route integration (Plan 02-05 or daemon phase)
- `runIndex()` ready for daemon HTTP route integration
- All engine public exports (`runIndex`, `registerRepo`, `removeRepo`, `listRepos`, `getRepoStatus`, `grepRepo`) are fully traced via `lensFn`
- ENGN-07 and ENGN-08 satisfied — grep returns structural metadata, barrel is ENGN-08 compliant
- Engine package builds (43.52 KB ESM) and typechecks clean

---
*Phase: 02-intelligence-engine*
*Completed: 2026-02-19*

## Self-Check: PASSED

All key files found. All commits verified:
- `2b1b7e9` FOUND
- `78fe066` FOUND
