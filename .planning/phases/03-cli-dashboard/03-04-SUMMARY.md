---
phase: 03-cli-dashboard
plan: 04
subsystem: ui
tags: [react, hono, sqlite, react-router, tanstack-query, tailwind, shadcn]

requires:
  - phase: 03-02
    provides: "@lens/ui package with AppSidebar, SidebarProvider, SidebarInset, PageHeader, Card, Badge, cn"
  - phase: 03-03
    provides: "Dashboard Vite SPA scaffold with react-router, TanStack Query, typed API client"
provides:
  - "RootLayout with AppSidebar from @lens/ui, SidebarProvider/SidebarInset wrapping Outlet"
  - "StatusBadge component using Badge/cn from @lens/ui"
  - "Overview page with stat cards (repos/files/chunks/uptime) and repo grid using Card/PageHeader from @lens/ui"
  - "Router updated with RootLayout as parent, Overview as index route"
  - "TraceStore.queryTraces() and TraceStore.querySpans() methods"
  - "getTraceStore() singleton exported from @lens/core"
  - "getRawDb() raw sqlite accessor exported from @lens/engine"
  - "GET /traces and GET /traces/:traceId endpoints"
  - "GET /repos/:id/files and GET /repos/:id/files/:path endpoints"
  - "GET /stats endpoint (repos_count, total_files, total_chunks, uptime_seconds)"
affects: [03-05, 03-06, 03-07]

tech-stack:
  added: [lucide-react (dashboard direct dep)]
  patterns:
    - "getTraceStore() singleton pattern mirrors getEngineDb() pattern from engine"
    - "getRawDb() exposes raw better-sqlite3 for complex SQL not expressible in drizzle"
    - "filesRoutes mounted on /repos alongside reposRoutes — two Hono sub-apps on same prefix"

key-files:
  created:
    - apps/dashboard/src/components/StatusBadge.tsx
    - apps/dashboard/src/components/RootLayout.tsx
    - apps/dashboard/src/pages/Overview.tsx
    - apps/daemon/src/routes/traces.ts
    - apps/daemon/src/routes/files.ts
  modified:
    - apps/dashboard/src/router.tsx
    - apps/dashboard/package.json
    - packages/core/src/trace-store.ts
    - packages/core/src/index.ts
    - packages/engine/src/db/connection.ts
    - packages/engine/src/index.ts
    - apps/daemon/src/http.ts

key-decisions:
  - "lucide-react added as direct dashboard dep — @lens/ui is source-only, Vite can't resolve transitive deps"
  - "getRawDb() added to engine connection — Db type (drizzle BetterSQLite3Database) doesn't expose raw prepare(), needed for complex JOIN queries in files routes"
  - "filesRoutes mounted separately on /repos prefix alongside reposRoutes — avoids modifying repos.ts, clean separation"
  - "GET /stats in http.ts directly (top-level route) rather than a separate file — single handler, no routing overhead"

requirements-completed: [DASH-01, DASH-06]

duration: 4min
completed: 2026-02-20
---

# Phase 3 Plan 04: RootLayout, Overview Page, and Daemon API Routes Summary

**Dashboard layout shell (AppSidebar from @lens/ui), Overview page with stat cards and repo grid, plus daemon /traces, /repos/:id/files, and /stats routes all in one pass.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-19T12:48:55Z
- **Completed:** 2026-02-19T12:53:26Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- RootLayout imports AppSidebar, SidebarProvider, SidebarInset from @lens/ui — no local UI primitives
- Overview page shows stat cards (Repos/Files/Chunks/Uptime) and repo grid with StatusBadge, click-to-navigate
- Daemon now serves all API endpoints the dashboard needs: /traces, /repos/:id/files, /stats

## Task Commits

1. **Task 1: RootLayout, StatusBadge, Overview page, router update** - `944956f` (feat)
2. **Task 2: TraceStore query methods, getTraceStore singleton, daemon routes** - `4cf83c1` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/dashboard/src/components/StatusBadge.tsx` - Badge variants for ready/indexing/pending/error/active/inactive
- `apps/dashboard/src/components/RootLayout.tsx` - SidebarProvider + AppSidebar + SidebarInset layout
- `apps/dashboard/src/pages/Overview.tsx` - Stat cards + repo grid with navigation
- `apps/dashboard/src/router.tsx` - RootLayout parent route wrapping all children
- `apps/dashboard/package.json` - Added lucide-react direct dep
- `packages/core/src/trace-store.ts` - queryTraces(), querySpans(), getTraceStore() singleton
- `packages/core/src/index.ts` - Export getTraceStore
- `packages/engine/src/db/connection.ts` - getRawDb() raw sqlite accessor + _sqlite instance var
- `packages/engine/src/index.ts` - Export getRawDb
- `apps/daemon/src/routes/traces.ts` - GET /traces, GET /traces/:traceId
- `apps/daemon/src/routes/files.ts` - GET /repos/:id/files, GET /repos/:id/files/:path
- `apps/daemon/src/http.ts` - Mount traces/files routes, add GET /stats

## Decisions Made

- **lucide-react as direct dep:** @lens/ui is a source-only package (no tsup build). When dashboard imports @lens/ui TypeScript directly, Vite bundles the source transitively. But `lucide-react` is a dep of @lens/ui, not @lens/dashboard — Vite can't resolve it at bundle time. Adding it directly to dashboard package.json fixes the resolution.
- **getRawDb() accessor:** The drizzle `Db` type wraps the sqlite instance and doesn't expose `.prepare()`. The files routes need complex LEFT JOIN queries with dynamic search that are cleaner in raw SQL. Added `getRawDb()` to expose the underlying `better-sqlite3` instance for this purpose.
- **filesRoutes on /repos prefix:** Hono allows multiple sub-apps on the same prefix (`app.route("/repos", reposRoutes)` and `app.route("/repos", filesRoutes)`). This keeps repos.ts clean while adding file endpoints in a dedicated file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added lucide-react to dashboard deps**
- **Found during:** Task 1 (dashboard build)
- **Issue:** RootLayout imports Lucide icons directly; Vite couldn't resolve `lucide-react` as it's only a dep of @lens/ui (source-only package), not declared in dashboard
- **Fix:** Added `"lucide-react": "^0.513.0"` to dashboard package.json deps
- **Files modified:** `apps/dashboard/package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter @lens/dashboard build` succeeds
- **Committed in:** `944956f` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added getRawDb() to engine**
- **Found during:** Task 2 (files route implementation)
- **Issue:** Plan referenced `getEngineDb().all(...)` for raw SQL, but `Db` type is drizzle wrapper without `prepare()`/`all()` methods. Files routes need complex JOINs most naturally expressed in raw SQL.
- **Fix:** Added `_sqlite` module variable to connection.ts, `getRawDb()` exported function, export added to engine index.ts
- **Files modified:** `packages/engine/src/db/connection.ts`, `packages/engine/src/index.ts`
- **Verification:** `pnpm --filter @lens/engine build` succeeds, `pnpm --filter @lens/daemon build` succeeds
- **Committed in:** `4cf83c1` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both required for build success and correct functionality. No scope creep.

## Issues Encountered

None beyond the two deviations above.

## Next Phase Readiness

- Dashboard has working layout shell with sidebar and Overview page
- Daemon has all API routes needed for Dashboard plans 05/06 (traces viewer, repos/files pages)
- Plans 05 and 06 can build page components on this scaffold without further infrastructure work

---
*Phase: 03-cli-dashboard*
*Completed: 2026-02-20*

## Self-Check: PASSED

- FOUND: apps/dashboard/src/components/StatusBadge.tsx
- FOUND: apps/dashboard/src/components/RootLayout.tsx
- FOUND: apps/dashboard/src/pages/Overview.tsx
- FOUND: apps/daemon/src/routes/traces.ts
- FOUND: apps/daemon/src/routes/files.ts
- FOUND: apps/dashboard/dist/index.html
- FOUND commit: 944956f (Task 1)
- FOUND commit: 4cf83c1 (Task 2)
