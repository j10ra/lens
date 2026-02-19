---
phase: 03-cli-dashboard
plan: 06
subsystem: ui
tags: [react, tanstack-query, tailwind, shadcn, react-router]

requires:
  - phase: 03-04
    provides: "Dashboard scaffold, StatusBadge, useRepos, api client, daemon /repos/:id/files and /repos/:id/files/:path routes"
  - phase: 03-02
    provides: "@lens/ui package with Card, Badge, PageHeader, Sheet, Separator, Tabs, Separator"

provides:
  - "Repos page with repo cards (name, path, status badge, stats), register inline form, re-index mutation"
  - "RepoDetail two-panel page (w-48 sidebar + content) with Overview and Files tabs"
  - "Files tab: dense raw table with #/Path/Lang/Exports/Chunks, search, pagination"
  - "File detail Sheet: exports, sections, internals, imports, imported_by, git stats, co-changes"
  - "Inter-file navigation: clicking import/importer/cochange paths updates Sheet reactively"
  - "useRepoFiles and useRepoFileDetail TanStack Query hooks with typed result types"
  - "router.tsx fully wired: /repos -> Repos, /repos/:repoId -> RepoDetail, /traces -> Traces"

affects: [03-07]

tech-stack:
  added: []
  patterns:
    - "Two-panel layout: hidden w-48 sidebar (desktop) + mobile <select> dropdown"
    - "Local useState for Sheet selectedFilePath — no global store needed for Sheet-local navigation"
    - "Dense raw <table> (not DataTable) for files — sticky thead, border-b/r cell styling"
    - "keepPreviousData on useRepoFiles for smooth pagination without flash"

key-files:
  created:
    - apps/dashboard/src/queries/use-repo-files.ts
    - apps/dashboard/src/pages/Repos.tsx
    - apps/dashboard/src/pages/RepoDetail.tsx
  modified:
    - apps/dashboard/src/router.tsx

key-decisions:
  - "Local useState for selectedFilePath (Sheet-local, no global store) — plan specified this explicitly, avoids unnecessary store complexity"
  - "useRepoFiles(repoId, { limit: 1 }) in RepoDetail overview tab to get total file count for sidebar badge without loading all files"
  - "router.tsx wires all three pages in one update — Repos, RepoDetail, and Traces (which was referenced but not imported before)"

requirements-completed: [DASH-03]

duration: 4min
completed: 2026-02-20
---

# Phase 3 Plan 06: Repo Explorer — Repos Page and RepoDetail Page Summary

**Repos list page with register/re-index actions, RepoDetail two-panel page with dense files table and file detail Sheet showing full structural context.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-19T12:56:02Z
- **Completed:** 2026-02-19T13:00:05Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Repos page shows repo cards with status badge, file/chunk/indexed stats, register inline form, re-index button
- RepoDetail two-panel layout matches v1 exactly: w-48 sidebar with section nav, right content area
- Files tab renders dense raw `<table>` (not DataTable) with sticky header, row numbers, search, pagination
- File detail Sheet shows exports, sections, internals, imports, imported_by, git stats (3-col grid), co-changes
- Inter-file navigation works: clicking import/imported_by/cochange paths updates Sheet content reactively
- All UI primitives from @lens/ui (Card, Badge, PageHeader, Sheet, SheetContent, Separator) — no local ui/ imports
- router.tsx fully wired with Repos, RepoDetail, and Traces (also fixed Traces which was referenced but not imported)

## Task Commits

1. **Task 1: Repos page, use-repo-files query hooks, router update** — `3cc6e3f` (feat)
2. **Task 2: RepoDetail two-panel page with files table and file detail Sheet** — `9b4df08` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/dashboard/src/queries/use-repo-files.ts` — useRepoFiles, useRepoFileDetail hooks + typed RepoFile, RepoFilesResult, FileDetail types
- `apps/dashboard/src/pages/Repos.tsx` — Repos list page with RepoCard component, register/re-index mutations
- `apps/dashboard/src/pages/RepoDetail.tsx` — RepoDetail with FilesTab and FileDetailSheet sub-components
- `apps/dashboard/src/router.tsx` — Full route wiring: /repos, /repos/:repoId, /traces

## Decisions Made

- **Local useState for selectedFilePath:** Plan specified Sheet navigation is local to RepoDetail page. repo-store.ts already existed from 03-05, but using it would be over-engineering for this use case. `useState<string | null>(null)` is simple and sufficient.
- **useRepoFiles({ limit: 1 }) for file count:** Overview tab needs total file count for the sidebar badge. Rather than a separate query, re-use useRepoFiles with limit 1 to get the `total` field without loading all files.
- **Router fixed Traces import too:** Prior state had `<Traces />` in router.tsx without an import (03-05 created Traces.tsx but didn't update router). Fixed as part of Task 1 router update (Rule 3 — blocking).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed missing Traces import in router.tsx**
- **Found during:** Task 1 (router update)
- **Issue:** Existing router.tsx had `element: <Traces />` without importing `Traces` from pages — TypeScript would fail at build
- **Fix:** Added `import { Traces } from "./pages/Traces.js"` to router.tsx imports
- **Files modified:** `apps/dashboard/src/router.tsx`
- **Committed in:** `3cc6e3f` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (blocking import)
**Impact on plan:** Required for build success. No scope creep.

## Issues Encountered

None beyond the one deviation above.

## Next Phase Readiness

- Repos and RepoDetail pages complete — dashboard has full repo explorer functionality
- Plan 03-07 (Traces viewer) is the final dashboard plan — scaffold already exists (Traces.tsx from 03-05)
- All routes wired in router.tsx

---
*Phase: 03-cli-dashboard*
*Completed: 2026-02-20*

## Self-Check: PASSED

- FOUND: apps/dashboard/src/queries/use-repo-files.ts
- FOUND: apps/dashboard/src/pages/Repos.tsx
- FOUND: apps/dashboard/src/pages/RepoDetail.tsx
- FOUND: apps/dashboard/src/router.tsx (updated)
- FOUND commit: 3cc6e3f (Task 1)
- FOUND commit: 9b4df08 (Task 2)
