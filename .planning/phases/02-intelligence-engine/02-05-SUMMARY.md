---
phase: 02-intelligence-engine
plan: "05"
subsystem: api
tags: [hono, engine-wiring, repos-crud, grep, mcp, daem-05, daem-06]

# Dependency graph
requires:
  - phase: 02-04
    provides: grepRepo() structural grep, lensFn-wrapped public barrel, all engine exports
  - phase: 02-01
    provides: Engine DB connection, registerRepo/runIndex/removeRepo/listRepos engine functions
  - phase: 01-02
    provides: lensRoute(), daemon HTTP infrastructure, LENS_MCP flag pattern
provides:
  - POST /repos: register repo by path, returns RepoRecord (201)
  - GET /repos: list all registered repos
  - DELETE /repos/:id: remove repo and cascade deletes
  - POST /repos/:id/index: trigger full reindex, returns IndexResult
  - POST /grep: real engine grepRepo() results (not stub), enriched with importers/cochangePartners/isHub
  - Engine DB initialized at daemon startup via configureEngineDb(INDEX_DB)
  - MCP lens_grep returns real structural results end-to-end
affects: [phase-03-cli, phase-04-hardening, dashboard-api-consumers]

# Tech tracking
tech-stack:
  added: ["@lens/engine as workspace dep in daemon"]
  patterns:
    - "Resolve repoPath to repoId via listRepos() lookup in grep route — no separate query needed at Phase 2 scale"
    - "Hono c.req.param() returns string | undefined — cast as string after route match (route guarantees presence)"
    - "force?: boolean defaulting to false for index trigger — JSON body is optional"
    - "Index DB path: join(DATA_DIR, 'index.db') parallel to traces.db"

key-files:
  created:
    - apps/daemon/src/routes/repos.ts
  modified:
    - apps/daemon/src/routes/grep.ts
    - apps/daemon/src/http.ts
    - apps/daemon/src/index.ts
    - apps/daemon/package.json
    - apps/daemon/tsup.config.ts

key-decisions:
  - "Repo path resolution in grep route: listRepos() then find() — no getRepoByPath() query added, O(repos) is fine for Phase 2"
  - "@lens/engine externalized in daemon tsup config — workspace packages ship their own builds, must not be rebundled"
  - "404 for removeRepo with removed=false — engine removeRepo() returns {removed: boolean}, route maps to 404 when false"
  - "409 Conflict for not-yet-indexed repo in grep — index_status check before grepRepo() call"

patterns-established:
  - "DAEM-05/06 pattern: repo CRUD routes all wrapped in lensRoute(), engine fns called via getEngineDb() singleton"
  - "Engine startup: configureEngineDb(INDEX_DB) called after configureLensFn/configureLensRoute/configureLogger, before startHttpServer()"

requirements-completed: [DAEM-05, DAEM-06]

# Metrics
duration: 3min
completed: 2026-02-19
---

# Phase 02 Plan 05: Daemon Route Wiring Summary

**Repo CRUD endpoints (register/list/remove/reindex) + real grepRepo() replacing stub, completing the engine-to-HTTP-to-MCP pipeline**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-19T11:11:47Z
- **Completed:** 2026-02-19T11:14:18Z
- **Tasks:** 2
- **Files modified:** 6 (1 created, 5 updated)

## Accomplishments

- `repos.ts`: Four new daemon routes — POST /repos (register), GET /repos (list), DELETE /repos/:id (remove), POST /repos/:id/index (trigger reindex). All wrapped in `lensRoute()`. Engine calls via `getEngineDb()` singleton pattern. Proper 201/200/404 status codes.
- `grep.ts`: Stub replaced with real `grepRepo()` call. Resolves `repoPath` to `repoId` via `listRepos()` lookup. Returns 404 for unregistered repos and 409 for not-yet-indexed repos (both with helpful hints). Real results: enriched matches with importers, co-change partners, hub score, exports, docstring.
- `index.ts`: Engine DB initialized at startup — `configureEngineDb(INDEX_DB)` added after configure* calls, before `startHttpServer()`.
- `http.ts`: `/repos` routes mounted alongside existing `/health` and `/grep`.
- End-to-end verified: register → index (94 files scanned) → grep (real enriched results) → delete.
- MCP `lens_grep` tool inherits real results with no code change — it was already a gate calling `/grep`.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Repo CRUD routes + engine DB startup wiring | `8e7fe95` | repos.ts (new), http.ts, index.ts, package.json, tsup.config.ts |
| 2 | Wire grep route to real engine — replace stub | `5aee58d` | grep.ts |

## Files Created/Modified

- `apps/daemon/src/routes/repos.ts` — 4 repo management routes (POST, GET, DELETE /:id, POST /:id/index), all `lensRoute`-wrapped
- `apps/daemon/src/routes/grep.ts` — Real `grepRepo()` call, repoPath→repoId lookup, 404/409 error handling
- `apps/daemon/src/http.ts` — Added `reposRoutes` import and `app.route("/repos", reposRoutes)`
- `apps/daemon/src/index.ts` — Added `configureEngineDb(INDEX_DB)` at startup
- `apps/daemon/package.json` — Added `"@lens/engine": "workspace:*"` dependency
- `apps/daemon/tsup.config.ts` — Added `@lens/engine` to externals

## Decisions Made

- Repo path resolution in grep route via `listRepos()` then `.find()` — avoids adding a `getRepoByPath()` query to the engine package for Phase 2. O(repos) is negligible at this scale. Phase 4 can optimize if needed.
- `@lens/engine` externalized in tsup config — workspace packages ship their own dist, must not be rebundled into daemon.
- `c.req.param("id") as string` cast — Hono's `param()` is typed `string | undefined` but route pattern guarantees presence; cast avoids noise without runtime risk.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type error on c.req.param("id")**
- **Found during:** Task 1 (repos.ts typecheck)
- **Issue:** `c.req.param("id")` typed as `string | undefined`, but `removeRepo()` and `runIndex()` require `string`
- **Fix:** Added `as string` cast — route pattern `/:id` guarantees param presence; Hono's overloaded types are overly conservative
- **Files modified:** apps/daemon/src/routes/repos.ts
- **Verification:** `pnpm --filter @lens/daemon typecheck` exits 0
- **Committed in:** `8e7fe95` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — type error)
**Impact on plan:** Minimal — single cast on 2 lines. No logic change.

## Issues Encountered

None beyond the type fix above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Full daemon API is now operational: repo management, indexing, and structural grep all work end-to-end
- MCP `lens_grep` returns real results — agents can query structural context
- Phase 3 (CLI) can wire `lens register`, `lens index`, `lens grep` commands to these daemon endpoints
- Phase 4 (hardening) can add `getRepoByPath()` query optimization, rate limiting, better error handling
- Phase 2 (Intelligence Engine) is 100% complete — all 5 plans done

---
*Phase: 02-intelligence-engine*
*Completed: 2026-02-19*

## Self-Check: PASSED

All key files found. All commits verified:
- `8e7fe95` FOUND
- `5aee58d` FOUND
