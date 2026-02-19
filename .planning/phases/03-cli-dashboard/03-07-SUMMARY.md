---
phase: 03-cli-dashboard
plan: 07
subsystem: daemon
tags: [hono, serve-static, spa, cors, dashboard, static-files]

# Dependency graph
requires:
  - phase: 03-cli-dashboard
    provides: dashboard SPA built to apps/dashboard/dist/ (03-04, 03-05, 03-06)
  - phase: 03-cli-dashboard
    provides: daemon HTTP server with API routes (03-03)
provides:
  - Daemon serves dashboard SPA at localhost:4111
  - SPA fallback for client-side routing (index.html for unmatched GET routes)
  - CORS middleware for local dev (Vite :5173 calls daemon :4111)
  - LENS_DASHBOARD_DIST env var for custom dist path override
affects: [phase-04-hardening]

# Tech tracking
tech-stack:
  added: [serveStatic from @hono/node-server/serve-static, cors from hono/cors]
  patterns:
    - serveStatic after all API routes (wildcard order matters)
    - rewriteRequestPath strips leading slash for absolute root path compatibility
    - CJS/ESM compat __filename guard for ESM-safe path resolution

key-files:
  created: []
  modified: [apps/daemon/src/http.ts]

key-decisions:
  - "serveStatic comes after all API routes — wildcard intercepts before API routes if placed first"
  - "rewriteRequestPath strips leading slash — path.join(absoluteRoot, '/file') returns /file without it"
  - "CORS added unconditionally — harmless in production, required for Vite dev server workflow"
  - "Two serveStatic calls: first serves assets by path match, second is SPA fallback via index.html path option"

patterns-established:
  - "Static serving pattern: API routes → serveStatic(root) → serveStatic(index.html fallback)"

requirements-completed: [DAEM-03]

# Metrics
duration: 4min
completed: 2026-02-20
---

# Phase 3 Plan 07: serveStatic Dashboard SPA Summary

**Daemon serves dashboard SPA at localhost:4111 via @hono/node-server serveStatic with SPA fallback routing and CORS for Vite dev workflow**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-19T13:02:46Z
- **Completed:** 2026-02-19T13:06:00Z
- **Tasks:** 1/2 (Task 2 is human verification checkpoint)
- **Files modified:** 1

## Accomplishments
- serveStatic from @hono/node-server serves apps/dashboard/dist/ at all GET routes after API
- SPA fallback: unmatched GET routes serve index.html so React Router handles /repos, /traces, etc.
- CORS middleware added for local dev workflow
- LENS_DASHBOARD_DIST env var allows path override
- Verified: /health returns JSON, / returns HTML, /some-spa-route returns HTML (fallback), /repos returns JSON (API intact)

## Task Commits

1. **Task 1: Configure serveStatic in daemon for dashboard SPA** - `728b8cd` (feat)

**Plan metadata:** pending final commit

## Files Created/Modified
- `apps/daemon/src/http.ts` - Added serveStatic middleware, CORS, ESM-safe path resolution for DASHBOARD_DIST

## Decisions Made
- `serveStatic` from `@hono/node-server` `root` option accepts absolute paths when combined with `rewriteRequestPath` to strip leading slash — `path.join('/absolute', '/file')` = `/file` on POSIX, so the strip is required
- Two `serveStatic` calls: first matches exact file paths, second serves `index.html` as SPA fallback for any unmatched route
- CORS added unconditionally (not gated on LENS_MCP) — harmless in production, required for dev

## Deviations from Plan

None - plan executed exactly as written. The plan pre-documented the `rewriteRequestPath` approach as the correct fix for absolute path handling.

## Issues Encountered

Pre-existing TypeScript errors in `src/routes/files.ts` (line 19) and `src/routes/traces.ts` (line 21) from previous plans — not introduced by this task, out of scope per deviation rule scope boundary. Build (`tsup`) succeeds; only `tsc --noEmit` reports them.

## Self-Check: PASSED

All files and commits verified present.

## Next Phase Readiness
- Phase 3 complete pending human verification (Task 2 checkpoint)
- Phase 4 (hardening) can begin after checkpoint passes
- Single daemon entry point confirmed working: CLI, MCP, and browser dashboard all served from :4111

---
*Phase: 03-cli-dashboard*
*Completed: 2026-02-20*
