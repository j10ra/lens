---
phase: 02-intelligence-engine
plan: "02"
subsystem: import-graph
tags: [import-graph, co-change, git-analysis, regex, structural-signals]

# Dependency graph
requires:
  - phase: 02-01
    provides: Engine DB (fileImports, fileStats, fileCochanges tables), chunkQueries, importQueries, statsQueries, cochangeQueries
provides:
  - extractImportSpecifiers(): regex-based import extraction for TS/JS/Python/Go/Rust
  - resolveImport(): relative specifier resolution with multi-extension fallback
  - buildAndPersistImportGraph(): chunk-merge-first import graph builder writing to fileImports
  - analyzeGitHistory(): git log parser with co-change frequency computation writing to fileStats + fileCochanges
  - repoQueries.updateGitAnalysisCommit(): HEAD commit tracking for incremental analysis
affects: [02-03-scoring, 02-04-engine, daemon-index-routes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Chunk-merge before extraction — merge all chunks for a file, then call extractImportSpecifiers() once per file"
    - "Lexicographic pair ordering — pathA < pathB ensures consistent dedup key for co-change pairs"
    - "clearForRepo() before import graph rebuild — fresh build, no stale edges"
    - "sinceCommit..HEAD incremental analysis — repoQueries.updateGitAnalysisCommit() stores HEAD for next run"

key-files:
  created:
    - packages/engine/src/index/imports.ts
    - packages/engine/src/index/import-graph.ts
    - packages/engine/src/index/git-analysis.ts
  modified:
    - packages/engine/src/db/queries.ts

key-decisions:
  - "resolveImport signature: (specifier, sourceFilePath, knownPaths) — plan spec, not v1 signature which passes language separately"
  - "extractImportSpecifiers returns relative-only specifiers — node:* and package imports filtered out at extraction time"
  - "Go imports not resolved by path — Go uses module paths not relative ./paths; extractGo() collects module paths but resolveImport() skips non-relative specifiers"
  - "parseGitLog exported — enables unit testing of commit parsing independently of execFile"

requirements-completed: [ENGN-03, ENGN-04]

# Metrics
duration: 2min
completed: 2026-02-19
---

# Phase 02 Plan 02: Import Graph + Git Co-change Summary

**Regex-based import graph construction (TS/JS/Python/Go/Rust) and git co-change analysis with merge-skip and noise filtering**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-19T08:14:38Z
- **Completed:** 2026-02-19T08:16:45Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `imports.ts`: `extractImportSpecifiers()` handles TypeScript, JavaScript, TypescriptReact, JavascriptReact, Python, Go, Rust via dedicated regex patterns; relative-only output (filters node_modules/built-ins)
- `imports.ts`: `resolveImport()` uses `path.posix.dirname()` + normalizePosix, tries `.ts/.tsx/.js/.jsx//index.ts/.../index.jsx` then `.py/__init__.py` extensions
- `import-graph.ts`: `buildAndPersistImportGraph()` — merges all chunks per file before extraction (avoids chunk-boundary import splits), builds knownPaths set, deduplicates edges, clears old edges before rebuild
- `git-analysis.ts`: `analyzeGitHistory()` — `git log --name-only --format=%H%x00%aI --no-merges`, skips commits >20 files, accumulates per-file stats (commitCount, recentCount 90d, lastModified), generates pairwise co-change keys with lexicographic ordering
- `git-analysis.ts`: Filters co-change pairs to count >= 2 (MIN_COCHANGE_THRESHOLD), persists via `statsQueries.upsertStats()` and `cochangeQueries.upsertPairs()`
- `queries.ts`: Added `repoQueries.updateGitAnalysisCommit()` — stores HEAD for incremental analysis

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Import specifier extraction and import graph builder | `40c5955` | imports.ts (new), import-graph.ts (new) |
| 2 | Git co-change analysis | `ff00bf7` | git-analysis.ts (new), queries.ts (updateGitAnalysisCommit added) |

## Files Created/Modified

- `packages/engine/src/index/imports.ts` — extractImportSpecifiers(), resolveImport(), language-specific regex extractors, normalizePosix()
- `packages/engine/src/index/import-graph.ts` — buildAndPersistImportGraph() with chunk-merge pattern and edge dedup
- `packages/engine/src/index/git-analysis.ts` — analyzeGitHistory(), parseGitLog(), MAX_FILES_PER_COMMIT=20, MIN_COCHANGE_THRESHOLD=2, RECENT_DAYS=90
- `packages/engine/src/db/queries.ts` — repoQueries.updateGitAnalysisCommit() added

## Decisions Made

- `resolveImport` uses plan-specified signature `(specifier, sourceFilePath, knownPaths)` — differs from v1 which passes `language` separately; language not needed since relative specifier resolution is extension-based
- Go import resolution intentionally skipped — Go uses module paths (e.g. `github.com/foo/bar`), not relative `./` paths; `extractGo()` returns module path strings but `resolveImport()` correctly returns null for non-relative specifiers
- `parseGitLog()` exported as named export — enables testing the commit parser in isolation without execFile
- `typescriptreact`/`javascriptreact` language codes added alongside `tsx`/`jsx` v1 aliases — LANG_MAP in discovery.ts uses short forms but plan spec uses long forms

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — build and typecheck clean on first attempt for both tasks.

## Next Phase Readiness

- Import graph signals ready for scoring: `importQueries.getImporters()` provides indegree for hub scoring
- Co-change signals ready for scoring: `cochangeQueries.getPartners()` provides co-change partners
- Both modules write to the DB tables established in Plan 02-01
- Plan 02-03 (composite scorer) can now consume these signals

---
*Phase: 02-intelligence-engine*
*Completed: 2026-02-19*

## Self-Check: PASSED

All key files found. All commits verified:
- `40c5955` FOUND
- `ff00bf7` FOUND
