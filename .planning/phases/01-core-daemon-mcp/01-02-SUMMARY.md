---
phase: 01-core-daemon-mcp
plan: "02"
subsystem: infra
tags: [hono, mcp, stdio, sqlite, tracestore, lensroute, node-server, zod]

requires:
  - phase: 01-core-daemon-mcp plan 01
    provides: "lensRoute(), configureLensRoute(), createTraceStore(), configureLogger(), @lens/core ESM+CJS build"

provides:
  - "Hono HTTP server on :4111 with /health route — GET returns status/uptime/version JSON"
  - "lensRoute() wrapping all HTTP handlers — spans recorded in TraceStore on every request"
  - "MCP stdio server with lens_grep stub tool — discoverable by agents, returns structured placeholder"
  - "Single-process HTTP + MCP on separate I/O channels (HTTP on TCP, MCP on stdin/stdout)"
  - "DATA_DIR (~/.lens/) created at startup with mkdirSync — DB always available"
  - "apps/daemon/dist/index.js — ESM Node.js process entry point"

affects:
  - "01-03 (engine routes plug into this HTTP server)"
  - "01-04 (MCP adoption benchmark tests lens_grep)"
  - "02-engine"

tech-stack:
  added:
    - "hono ^4.11.10 — HTTP framework with Hono app + route mounting"
    - "@hono/node-server ^1.19.9 — Node.js serve() adapter for Hono"
    - "@modelcontextprotocol/sdk ^1.26.0 — McpServer, StdioServerTransport, registerTool"
    - "zod ^3.24.0 — input schema validation for MCP tool parameters"
    - "@types/node ^22.0.0 — Node.js type declarations (devDep, required for tsc)"
  patterns:
    - "lensRoute() pattern — every Hono handler wrapped, never naked handlers"
    - "LENS_MCP=false env flag — disable MCP stdio for HTTP-only testing"
    - "mkdirSync before createTraceStore — DATA_DIR guaranteed to exist"
    - "stderr-only logging in daemon — stdout reserved for MCP JSON-RPC"

key-files:
  created:
    - "apps/daemon/src/routes/health.ts — GET /health via lensRoute(), returns status/uptime/version"
    - "apps/daemon/src/http.ts — Hono app, error handler, /health mount, startHttpServer()"
    - "apps/daemon/src/mcp.ts — McpServer with lens_grep stub, StdioServerTransport"
    - "apps/daemon/src/index.ts — mkdirSync, createTraceStore, configure*, startHttpServer + startMcpServer"
    - "apps/daemon/tsconfig.json — NodeNext, ES2022, strict, skipLibCheck"
    - "apps/daemon/tsup.config.ts — ESM-only, externalize @lens/core"
  modified:
    - "apps/daemon/package.json — full dep set: MCP SDK, hono, @hono/node-server, zod, @types/node"

key-decisions:
  - "@types/node added as devDependency — plan omitted it, tsc fails without Node.js type declarations"
  - "LENS_MCP env flag controls MCP stdio activation — allows HTTP-only mode for curl testing without stdio takeover"
  - "mkdirSync(DATA_DIR, { recursive: true }) before createTraceStore() — plan noted it as important_fix, correctly applied"
  - "@lens/core externalized in tsup config — workspace package ships its own build, must not be rebundled"

patterns-established:
  - "startHttpServer(): void — non-blocking serve(), returns immediately, event loop handles requests"
  - "startMcpServer(): Promise<void> — async, awaited after HTTP start, connect() takes over stdio"
  - "main() pattern: mkdirSync → configure* → startHttpServer → startMcpServer"
  - "Adding new routes: create src/routes/{name}.ts with lensRoute() wrappers, mount in http.ts via app.route()"

requirements-completed: [DAEM-01, DAEM-02, DAEM-04]

duration: 3min
completed: 2026-02-19
---

# Phase 1 Plan 02: @lens/daemon Skeleton Summary

**Hono HTTP server on :4111 with lensRoute()-wrapped health route + MCP stdio server with lens_grep stub — single process, TraceStore spans confirmed, no stdout writes**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-19T06:36:38Z
- **Completed:** 2026-02-19T06:39:26Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Daemon starts HTTP on :4111 and MCP on stdio in the same process — `LENS_MCP=false` for HTTP-only testing
- `/health` returns `{"status":"ok","uptime":N,"version":"2.0.0"}` — lensRoute() span recorded in TraceStore
- MCP `lens_grep` tool registered with verb-first description and zod-typed parameters — discoverable by agents
- `~/.lens/` created at startup via `mkdirSync` — `traces.db` WAL mode, spans confirmed via sqlite3 query

## Task Commits

1. **Task 1: Daemon package scaffold** — `ebec1c0` (chore)
2. **Task 2: Daemon implementation** — `7ec2a95` (feat)

**Plan metadata:** TBD (docs commit)

## Files Created/Modified

- `apps/daemon/src/routes/health.ts` — GET /health, `lensRoute('health.get', ...)`, status/uptime/version
- `apps/daemon/src/http.ts` — Hono app, `onError` handler (stderr), `/health` mount, `startHttpServer()`
- `apps/daemon/src/mcp.ts` — `McpServer` with `lens_grep` tool stub, `StdioServerTransport`
- `apps/daemon/src/index.ts` — mkdirSync DATA_DIR, createTraceStore, configure*, startHttpServer, startMcpServer
- `apps/daemon/tsconfig.json` — NodeNext module, ES2022 target, strict, skipLibCheck
- `apps/daemon/tsup.config.ts` — ESM-only format, externalize `@lens/core`, clean output
- `apps/daemon/package.json` — MCP SDK, hono, @hono/node-server, zod, @types/node

## How to Start the Daemon

```bash
# HTTP + MCP (normal operation — MCP takes over stdin/stdout)
node apps/daemon/dist/index.js

# HTTP only (testing with curl — MCP stdio disabled)
LENS_MCP=false node apps/daemon/dist/index.js

# Custom data directory
LENS_DATA_DIR=/tmp/lens-test LENS_MCP=false node apps/daemon/dist/index.js

# JSON log output
LENS_MCP=false node apps/daemon/dist/index.js --json
```

## Adding New Routes

```typescript
// 1. Create src/routes/{name}.ts
import { Hono } from 'hono'
import { lensRoute } from '@lens/core'
export const myRoutes = new Hono()
myRoutes.get('/', lensRoute('myroute.get', async (c) => c.json({ ok: true })))

// 2. Mount in src/http.ts
import { myRoutes } from './routes/myroute.js'
app.route('/myroute', myRoutes)
```

Every handler MUST use `lensRoute()` — naked Hono handlers are not permitted (plan must_have).

## MCP Tool: lens_grep

- **Tool name:** `lens_grep`
- **Phase 1 behavior:** Returns structured placeholder with `results: []` and a note to run `lens register + lens index`
- **Phase 2 behavior:** Replaced with real engine query (import graph, co-change, hub scores)
- **Parameters:** `repoPath` (string), `query` (string), `limit` (int 1-50, default 20)
- **Description pattern:** Verb-first, 1-2 sentences, agent-oriented — parameter `.describe()` carries operational detail

## Decisions Made

- `@types/node` added to devDependencies — plan omitted it; `tsc --noEmit` fails without Node.js type declarations (`process`, `node:fs`, etc.)
- `LENS_MCP` env flag pattern — `process.env.LENS_MCP !== 'false'` enables HTTP-only mode for development/testing without MCP stdio takeover
- `mkdirSync(DATA_DIR, { recursive: true })` before `createTraceStore()` — explicitly noted as important_fix in plan; `~/.lens/` may not exist on first run

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added @types/node to devDependencies**
- **Found during:** Task 2 (`pnpm typecheck` run)
- **Issue:** Plan's package.json didn't include `@types/node`; tsc emits 9 errors (`Cannot find name 'process'`, `Cannot find module 'node:fs'`, etc.)
- **Fix:** Added `"@types/node": "^22.0.0"` to `devDependencies`, ran `pnpm install`
- **Files modified:** `apps/daemon/package.json`
- **Verification:** `tsc --noEmit` exits 0 after install
- **Committed in:** `7ec2a95` (Task 2)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for typecheck to pass. No scope creep.

## Issues Encountered

None beyond the single auto-fix above.

## User Setup Required

None — no external service configuration required. Data directory (`~/.lens/`) is created automatically at startup.

## Next Phase Readiness

- Daemon HTTP shape established — Plan 03 (engine routes) mounts additional routes via `app.route()` in `http.ts`
- MCP stub registered — Plan 04 (adoption benchmark) can call `lens_grep` tool and verify agent discovery
- `lensRoute()` tracing confirmed working — every HTTP request produces a `spans` row in `~/.lens/traces.db`
- Build: `pnpm --filter @lens/daemon build` → `dist/index.js` (ESM, 3.34 KB)

## Self-Check: PASSED

Files verified on disk:
- apps/daemon/src/routes/health.ts — FOUND
- apps/daemon/src/http.ts — FOUND
- apps/daemon/src/mcp.ts — FOUND
- apps/daemon/src/index.ts — FOUND
- apps/daemon/tsconfig.json — FOUND
- apps/daemon/tsup.config.ts — FOUND
- apps/daemon/dist/index.js — FOUND
- Commits ebec1c0, 7ec2a95 — FOUND in git log

---
*Phase: 01-core-daemon-mcp*
*Completed: 2026-02-19*
