---
phase: 01-core-daemon-mcp
plan: "01"
subsystem: infra
tags: [better-sqlite3, drizzle-orm, hono, async-local-storage, tsup, observability]

requires: []
provides:
  - "lensFn() — zero-config async function tracing via AsyncLocalStorage"
  - "lensRoute() — Hono handler wrapper with per-request trace context"
  - "Logger — structured stderr output with traceId/spanId injection"
  - "TraceStore — SQLite WAL DB with batch writes (100ms), retention prune"
  - "Drizzle schema: traces, spans, logs tables with cascade delete"
  - "ESM+CJS dual output at packages/core/dist/"
affects:
  - "02-engine"
  - "03-daemon"
  - "04-mcp"

tech-stack:
  added:
    - "drizzle-orm ^0.45.1 — SQLite ORM for trace schema"
    - "better-sqlite3 ^12.6.2 — synchronous native SQLite bindings"
    - "hono ^4.11.10 — peerDependency for lensRoute() Hono types"
    - "drizzle-kit ^0.31.9 — migration generator"
  patterns:
    - "configure*() pattern — wire TraceStore into each primitive before first call"
    - "ALS span stack — parent-child span relationships via spanStack array"
    - "Stderr-only logging — stdout reserved for MCP JSON-RPC"
    - "ESM createRequire banner — native addon compat in ESM bundle"

key-files:
  created:
    - "packages/core/src/context.ts — AsyncLocalStorage store, TraceContext, Span, currentSpan()"
    - "packages/core/src/schema.ts — Drizzle SQLite schema (traces, spans, logs)"
    - "packages/core/src/trace-store.ts — TraceStore class, WAL, batch flush, prune"
    - "packages/core/src/lens-fn.ts — lensFn() async function wrapper"
    - "packages/core/src/lens-route.ts — lensRoute() Hono handler wrapper"
    - "packages/core/src/logger.ts — Logger singleton, human/JSON dual output"
    - "packages/core/src/index.ts — barrel export"
    - "packages/core/drizzle/0000_steady_orphan.sql — initial migration"
  modified:
    - "packages/core/package.json — full dep/export config with hono peerDep"
    - "packages/core/tsconfig.json — skipLibCheck added for drizzle-orm 0.45.1 compat"
    - "packages/core/tsup.config.ts — ESM+CJS with createRequire banner"
    - "packages/core/drizzle.config.ts — drizzle-kit config"

key-decisions:
  - "hono added as peerDependency + devDependency (not dependency) — consumers provide their own hono"
  - "skipLibCheck: true in tsconfig — drizzle-orm 0.45.1 ships broken gel/mysql2 type declarations"
  - "lensRoute() captures and returns handler result — original plan omitted return"
  - "CJS __dirname compat via typeof __filename !== undefined guard — import.meta.url is empty in CJS build"
  - "configure*() pattern chosen over constructor injection — global singletons, set once at daemon startup"

patterns-established:
  - "lensFn(name, fn): wrap every engine export — name becomes span name in TraceStore"
  - "lensRoute(name, handler): wrap every Hono route — one trace per HTTP request"
  - "configureLogger/configureLensFn/configureLensRoute: call once at process start with shared TraceStore"
  - "ctx.log.* is NOT used here — Logger is a static object; future phases may add ctx pattern"

requirements-completed: [CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, CORE-06]

duration: 4min
completed: 2026-02-19
---

# Phase 1 Plan 01: @lens/core Package Summary

**AsyncLocalStorage-based tracing primitives — lensFn(), lensRoute(), Logger, TraceStore — with SQLite WAL backend, 100ms batch writes, and ESM+CJS dual output**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-19T06:29:24Z
- **Completed:** 2026-02-19T06:33:26Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- `lensFn()` wraps async functions with zero-config tracing — span recorded in TraceStore, parentSpanId chain correct for nested calls
- `TraceStore` uses WAL mode, batches writes at 100ms intervals, hourly prune, ESM+CJS `__dirname` compat
- `Logger` writes exclusively to stderr (verified by grep), attaches `traceId`+`spanId` from ALS, human-readable by default / JSON via flag
- Smoke test confirms: greet('world') → span row in SQLite with correct name, durationMs, inputSize, outputSize

## Task Commits

1. **Task 1: Package scaffold** — `2ff9bf5` (chore)
2. **Task 2: Core implementation** — `530579a` (feat)

**Plan metadata:** TBD (docs commit)

## Files Created/Modified

- `packages/core/src/context.ts` — `AsyncLocalStorage<TraceContext>`, spanStack, `currentSpan()`
- `packages/core/src/schema.ts` — Drizzle SQLite: `traces`, `spans`, `logs` tables
- `packages/core/src/trace-store.ts` — `TraceStore` class: WAL, 100ms batch flush, prune, `createTraceStore()`
- `packages/core/src/lens-fn.ts` — `lensFn(name, fn)` — wraps async fn, pushes span on success and error
- `packages/core/src/lens-route.ts` — `lensRoute(name, handler)` — Hono handler wrapper, returns result
- `packages/core/src/logger.ts` — `Logger.{info,warn,error,debug}()` — stderr-only, ALS-aware
- `packages/core/src/index.ts` — barrel re-exports all primitives + types
- `packages/core/drizzle/0000_steady_orphan.sql` — initial migration SQL
- `packages/core/package.json` — drizzle-orm, better-sqlite3, hono peerDep, dual exports map
- `packages/core/tsconfig.json` — `skipLibCheck: true` added
- `packages/core/tsup.config.ts` — ESM+CJS with `createRequire` banner for native addon

## Key Exports and Signatures

```typescript
// Wrapping
lensFn<TArgs, TReturn>(name: string, fn: (...args: TArgs) => Promise<TReturn>): (...args: TArgs) => Promise<TReturn>
lensRoute<E, P, I>(name: string, handler: Handler<E, P, I>): Handler<E, P, I>

// Configuration — call once at startup
configureLensFn(store: TraceStore): void
configureLensRoute(store: TraceStore): void
configureLogger(store: TraceStore, jsonMode?: boolean): void

// Logger
Logger.info(message: string): void
Logger.warn(message: string): void
Logger.error(message: string): void
Logger.debug(message: string): void

// TraceStore
createTraceStore(dbPath: string, retentionMs?: number): TraceStore
store.pushSpan(span: SpanRecord): void
store.pushLog(log: LogRecord): void
store.prune(): void
store.close(): void

// Context
storage: AsyncLocalStorage<TraceContext>
currentSpan(): Span | undefined
```

## TraceStore Schema

| Table | Key columns |
|-------|-------------|
| `traces` | `trace_id PK`, `root_span_name`, `started_at`, `ended_at`, `duration_ms` |
| `spans` | `span_id PK`, `trace_id FK→traces`, `parent_span_id`, `name`, `started_at`, `duration_ms`, `error_message`, `input_size`, `output_size` |
| `logs` | `id PK autoincrement`, `trace_id`, `span_id`, `level`, `message`, `timestamp` |

Cascade delete: deleting a trace removes all its spans. Orphaned logs pruned separately.

## configure*() Wiring Pattern

```typescript
// At daemon startup (once):
import { createTraceStore, configureLensFn, configureLensRoute, configureLogger } from '@lens/core'

const store = createTraceStore('./traces.db')
configureLensFn(store)
configureLensRoute(store)
configureLogger(store, process.argv.includes('--json'))

// Engine functions then auto-trace:
const myFn = lensFn('myFn', async (x) => { ... })
// Hono routes auto-trace:
app.get('/path', lensRoute('GET /path', async (c) => c.json({ ok: true })))
```

## Decisions Made

- `hono` is a `peerDependency` + `devDependency` — consumers (daemon) supply their own hono instance; types resolve during build
- `skipLibCheck: true` — drizzle-orm 0.45.1 has broken type declarations for `gel`, `mysql2`, `singlestore` in its own dist; not our code
- `lensRoute()` returns handler result explicitly — plan's original code used `await handler(c, next)` without capturing return value (fixes Hono response streaming)
- CJS `__dirname` compat: `typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url)` — `import.meta` is empty `{}` in tsup CJS builds; CJS runtime always provides `__filename`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `import { crypto } from 'node:crypto'` — wrong import**
- **Found during:** Task 2 (lens-fn.ts implementation)
- **Issue:** Plan showed `import { crypto } from 'node:crypto'` and `crypto.randomUUID()` — `crypto` is not a named export; `randomUUID` is
- **Fix:** Used `import { randomUUID } from 'node:crypto'` and called `randomUUID()` directly
- **Files modified:** `packages/core/src/lens-fn.ts`
- **Verification:** Build passes, typecheck passes
- **Committed in:** `530579a` (Task 2)

**2. [Rule 1 - Bug] Fixed lensRoute() missing return value**
- **Found during:** Task 2 (lens-route.ts review per known fixes)
- **Issue:** Plan's lensRoute captured `await handler(c, next)` result but didn't return it — Hono responses would be lost
- **Fix:** `const result = await handler(c, next); ... return result`
- **Files modified:** `packages/core/src/lens-route.ts`
- **Verification:** Build passes; lensRoute returns Response object correctly
- **Committed in:** `530579a` (Task 2)

**3. [Rule 1 - Bug] Fixed `import.meta.url` unavailable in CJS build**
- **Found during:** Task 2 (build warning + CJS dist inspection)
- **Issue:** `const __dirname = dirname(fileURLToPath(import.meta.url))` — `import.meta` is `{}` in tsup CJS output; would throw at runtime
- **Fix:** Added `typeof __filename !== 'undefined'` guard — CJS runtime always provides `__filename`
- **Files modified:** `packages/core/src/trace-store.ts`
- **Verification:** CJS dist inspected, `__filename` branch always taken in CJS context
- **Committed in:** `530579a` (Task 2)

**4. [Rule 2 - Missing Critical] Added skipLibCheck to tsconfig**
- **Found during:** Task 2 (`pnpm typecheck` run)
- **Issue:** drizzle-orm 0.45.1 ships broken `.d.ts` files for gel/mysql2/singlestore — 50+ errors from node_modules, none from our code
- **Fix:** Added `"skipLibCheck": true` to `packages/core/tsconfig.json`
- **Files modified:** `packages/core/tsconfig.json`
- **Verification:** `tsc --noEmit` exits 0, zero errors
- **Committed in:** `530579a` (Task 2)

**5. [Rule 2 - Missing Critical] Added hono as peerDependency + devDependency**
- **Found during:** Task 1 (plan known-fix review)
- **Issue:** `lens-route.ts` imports from `hono` — build would fail without it; consumers must not get a duplicate hono
- **Fix:** Added `"hono": "^4.11.10"` to both `peerDependencies` and `devDependencies`
- **Files modified:** `packages/core/package.json`
- **Verification:** Build passes, types resolve
- **Committed in:** `2ff9bf5` (Task 1)

---

**Total deviations:** 5 auto-fixed (3 bugs, 2 missing critical)
**Impact on plan:** All fixes required for correctness. No scope creep.

## Issues Encountered

None beyond the known fixes above.

## Next Phase Readiness

- `@lens/core` is fully built and exported at `packages/core/dist/index.js` (ESM) and `packages/core/dist/index.cjs` (CJS)
- Plan 02 (engine) can import `lensFn` and `TraceStore` from `@lens/core`
- Plan 03 (daemon) can import `lensRoute`, `Logger`, `createTraceStore`, `configureLensRoute`, `configureLogger`
- Smoke test verified: span row written to SQLite, Logger writes to stderr, exits 0

## Self-Check: PASSED

All files verified on disk:
- packages/core/src/{context,schema,trace-store,lens-fn,lens-route,logger,index}.ts — FOUND
- packages/core/dist/{index.js,index.cjs,index.d.ts} — FOUND
- packages/core/drizzle/0000_steady_orphan.sql — FOUND
- Commits 2ff9bf5, 530579a — FOUND in git log

---
*Phase: 01-core-daemon-mcp*
*Completed: 2026-02-19*
