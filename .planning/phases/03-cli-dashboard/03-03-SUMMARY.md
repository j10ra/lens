---
phase: 03-cli-dashboard
plan: 03
subsystem: dashboard
tags: [vite, react, tanstack-query, tanstack-store, react-router, tailwind-v4, typescript]

requires:
  - phase: 03-02-ui-package
    provides: "@lens/ui workspace package with OKLCH theme, shadcn primitives, globals.css"

provides:
  - "Dashboard SPA scaffold: Vite build, TanStack Query/Store wired, API client typed, router with 4 routes"
  - "src/lib/api.ts: DAEMON_URL + fetch wrappers for all daemon endpoints"
  - "src/store/repo-store.ts + trace-store.ts: TanStack Store UI state with selector hooks"
  - "src/queries/use-repos.ts + use-traces.ts: TanStack Query hooks with polling"
  - "src/router.tsx: react-router v7 with placeholder pages for /, /repos, /repos/:repoId, /traces"
  - "src/main.tsx: QueryClientProvider + RouterProvider + @lens/ui/globals.css theme"

affects: [03-04-dashboard-layout, 03-05-dashboard-graphs, 03-06-dashboard-traces]

tech-stack:
  added:
    - "react@^19.2.4, react-dom@^19.2.4"
    - "react-router@^7.13.0 (single package — no react-router-dom)"
    - "@tanstack/react-query@^5.90.21, @tanstack/react-query-devtools@^5.90.21"
    - "@tanstack/react-store@^0.9.1"
    - "vite@^7.3.1, @vitejs/plugin-react@^5.1.4"
    - "tailwindcss@^4.2.0, @tailwindcss/vite@^4.2.0"
    - "typescript@^5.7.0, @types/react@^19, @types/react-dom@^19"
  patterns:
    - "Tailwind v4 via @tailwindcss/vite plugin — no tailwind.config.ts needed"
    - "Workspace @lens/ui dep via 'workspace:*' — import TypeScript source directly"
    - "TanStack Query v5 single-object API: useQuery({ queryKey, queryFn })"
    - "TanStack Store selectors: useStore(store, s => s.field) — never bare useStore(store)"
    - "QueryClient at module level (never inside component body — avoids cache destruction)"
    - "All daemon calls via api.ts — DAEMON_URL single source of truth"

key-files:
  created:
    - apps/dashboard/package.json
    - apps/dashboard/vite.config.ts
    - apps/dashboard/tsconfig.json
    - apps/dashboard/index.html
    - apps/dashboard/src/main.tsx
    - apps/dashboard/src/router.tsx
    - apps/dashboard/src/lib/api.ts
    - apps/dashboard/src/store/repo-store.ts
    - apps/dashboard/src/store/trace-store.ts
    - apps/dashboard/src/queries/use-repos.ts
    - apps/dashboard/src/queries/use-traces.ts
  modified: []

key-decisions:
  - "@lens/ui added as 'workspace:*' in package.json manually — pnpm add @lens/ui fails because pnpm looks up npm registry before checking workspace"
  - "No local globals.css — dashboard imports @lens/ui/globals.css directly; @tailwindcss/vite plugin processes all CSS with Tailwind directives"
  - "Router uses placeholder div elements — RootLayout wrapping deferred to 03-04 per plan"
  - "useTraceSpans has enabled: !!traceId guard — prevents fetch with null traceId"

requirements-completed: [DASH-04]

duration: 3min
completed: 2026-02-19
---

# Phase 3 Plan 03: Dashboard SPA Scaffold Summary

**Vite SPA scaffold with TanStack Query/Store, typed API client, react-router v7, and @lens/ui theme — builds clean, ready for page components in 03-04**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-19T12:43:00Z
- **Completed:** 2026-02-19T12:46:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Configured `apps/dashboard` with Vite 7 + `@tailwindcss/vite` plugin (Tailwind v4, no config file)
- Wrote `package.json` with all runtime deps including `@lens/ui: "workspace:*"` — theme and components from shared package
- Created typed API client (`src/lib/api.ts`) with `DAEMON_URL` constant and typed fetch wrappers for all daemon routes
- Created two TanStack Store instances (`repoStore`, `traceStore`) with selector hooks preventing unnecessary re-renders
- Created TanStack Query hooks (`useRepos`, `useTraces`, `useTraceSpans`) with polling intervals
- Set up react-router v7 with `createBrowserRouter` and 4 placeholder routes
- Wired `main.tsx` with `QueryClientProvider`, `RouterProvider`, and `@lens/ui/globals.css` theme import
- `pnpm --filter @lens/dashboard build` produces `dist/index.html` cleanly

## Task Commits

1. **Task 1: Dashboard deps, config files, Vite + Tailwind setup** — `3ddeb56`
2. **Task 2: API client, stores, query hooks, router, main entry** — `18626fc`

## Files Created/Modified

- `apps/dashboard/package.json` — workspace @lens/ui dep, TanStack Query/Store, react-router, Vite devDeps
- `apps/dashboard/vite.config.ts` — @tailwindcss/vite plugin, @vitejs/plugin-react, @ path alias
- `apps/dashboard/tsconfig.json` — ES2022, bundler moduleResolution, strict, @ paths
- `apps/dashboard/index.html` — standard Vite SPA entry
- `apps/dashboard/src/main.tsx` — QueryClientProvider + RouterProvider + @lens/ui/globals.css
- `apps/dashboard/src/router.tsx` — react-router v7 createBrowserRouter, 4 routes
- `apps/dashboard/src/lib/api.ts` — DAEMON_URL + typed fetch wrappers for all endpoints
- `apps/dashboard/src/store/repo-store.ts` — repoStore with selectedRepoId/selectedFilePath selectors
- `apps/dashboard/src/store/trace-store.ts` — traceStore with selectedTraceId/filterText selectors
- `apps/dashboard/src/queries/use-repos.ts` — useRepos() with 10s refetchInterval
- `apps/dashboard/src/queries/use-traces.ts` — useTraces() 5s poll + useTraceSpans() enabled guard

## Decisions Made

- `@lens/ui` added directly to `package.json` as `workspace:*` — `pnpm add @lens/ui` attempts npm registry lookup and fails for private workspace packages
- No local `globals.css` created — `@tailwindcss/vite` plugin processes Tailwind directives in `@lens/ui/globals.css` when imported
- Router uses plain div placeholders — RootLayout wrapping deferred to 03-04 per plan spec
- `useTraceSpans` has `enabled: !!traceId` — prevents spurious fetch when traceId is null

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] pnpm add @lens/ui fails for workspace packages**
- **Found during:** Task 1
- **Issue:** `pnpm --filter @lens/dashboard add @lens/ui` attempted npm registry lookup, got 404 — workspace packages must be specified as `workspace:*` in `package.json` directly, not via `pnpm add`
- **Fix:** Wrote `package.json` with all deps including `@lens/ui: "workspace:*"` manually; ran `pnpm install` to resolve
- **Files modified:** `apps/dashboard/package.json`
- **Commit:** 3ddeb56

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Dashboard builds clean with `pnpm --filter @lens/dashboard build`
- All data-fetching hooks ready: `useRepos()`, `useTraces()`, `useTraceSpans()`
- UI state stores ready: `repoStore`, `traceStore` with selector hooks
- API client typed for all daemon endpoints
- Ready for 03-04 (RootLayout + navigation) — import components from `@lens/ui`, wire to router

---
*Phase: 03-cli-dashboard*
*Completed: 2026-02-19*
