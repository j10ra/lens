<!-- ============================================================
     LENS v2 — Phase 1: Core + Daemon + MCP
     Four plans. Sequential dependency chain: 01-01 → 01-02 → 01-03 → 01-04
     01-04 is a GATE — Phase 2 must not start until adoption is confirmed.
     ============================================================ -->

---
phase: 01-core-daemon-mcp
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/core/package.json
  - packages/core/tsconfig.json
  - packages/core/tsup.config.ts
  - packages/core/drizzle.config.ts
  - packages/core/src/index.ts
  - packages/core/src/context.ts
  - packages/core/src/lens-fn.ts
  - packages/core/src/lens-route.ts
  - packages/core/src/logger.ts
  - packages/core/src/trace-store.ts
  - packages/core/src/schema.ts
  - packages/core/drizzle/0000_init.sql
autonomous: true
requirements:
  - CORE-01
  - CORE-02
  - CORE-03
  - CORE-04
  - CORE-05
  - CORE-06

must_haves:
  truths:
    - "A function wrapped in lensFn() records a span (spanId, traceId, name, durationMs, error) in TraceStore without any manual instrumentation"
    - "Nested lensFn() calls produce parent-child span relationships (parentSpanId set correctly)"
    - "Logger.info() inside a lensFn() attaches traceId and spanId to the log row; outside any span it writes without those fields"
    - "Logger writes human-readable text to stderr by default; --json flag switches to one-JSON-object-per-line on stderr"
    - "TraceStore prunes spans older than the retention window automatically on a setInterval schedule"
    - "pnpm --filter @lens/core build produces dist/index.js with named exports: lensFn, lensRoute, Logger, TraceStore"
  artifacts:
    - path: "packages/core/src/context.ts"
      provides: "AsyncLocalStorage store, TraceContext type"
      exports: ["storage", "TraceContext"]
    - path: "packages/core/src/lens-fn.ts"
      provides: "lensFn() wrapper"
      exports: ["lensFn"]
    - path: "packages/core/src/lens-route.ts"
      provides: "lensRoute() wrapper for Hono handlers"
      exports: ["lensRoute"]
    - path: "packages/core/src/logger.ts"
      provides: "Logger class with dual output"
      exports: ["Logger"]
    - path: "packages/core/src/trace-store.ts"
      provides: "TraceStore with Drizzle, WAL, prune"
      exports: ["TraceStore", "createTraceStore"]
    - path: "packages/core/src/schema.ts"
      provides: "Drizzle SQLite schema for traces, spans, logs"
      contains: "sqliteTable"
    - path: "packages/core/drizzle/0000_init.sql"
      provides: "Generated migration SQL"
  key_links:
    - from: "packages/core/src/lens-fn.ts"
      to: "packages/core/src/context.ts"
      via: "storage.run() establishes ALS context"
      pattern: "storage\\.run"
    - from: "packages/core/src/logger.ts"
      to: "packages/core/src/context.ts"
      via: "storage.getStore() reads current traceId/spanId"
      pattern: "storage\\.getStore"
    - from: "packages/core/src/trace-store.ts"
      to: "packages/core/src/schema.ts"
      via: "drizzle(sqlite, { schema })"
      pattern: "drizzle.*schema"
---

<objective>
Build the `@lens/core` package: AsyncLocalStorage context propagation, `lensFn()`, `lensRoute()`, Logger, and TraceStore (Drizzle + better-sqlite3, WAL, batch writes, retention prune).

Purpose: Every function and route in subsequent phases wraps in primitives defined here. API shape is locked after this plan — no retrofitting.
Output: `packages/core/dist/index.js` exporting lensFn, lensRoute, Logger, TraceStore with full TypeScript types.
</objective>

<execution_context>
@/Users/jalipalo/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jalipalo/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Package scaffold — dependencies, tsconfig, tsup, drizzle config</name>
  <files>
    packages/core/package.json
    packages/core/tsconfig.json
    packages/core/tsup.config.ts
    packages/core/drizzle.config.ts
  </files>
  <action>
Update `packages/core/package.json` to add all runtime and dev dependencies, exports map for dual CJS+ESM, and scripts:

```json
{
  "name": "@lens/core",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "drizzle"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate"
  },
  "dependencies": {
    "drizzle-orm": "^0.45.1",
    "better-sqlite3": "^12.6.2"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "drizzle-kit": "^0.31.9",
    "tsup": "^8.5.0",
    "typescript": "^5.7.0"
  }
}
```

Create `packages/core/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `packages/core/tsup.config.ts`:
```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  clean: true,
  banner(ctx) {
    // better-sqlite3 is a native CJS addon — needs createRequire in ESM context
    if (ctx.format === 'esm') {
      return {
        js: `import {createRequire as __createRequire} from 'module';var require=__createRequire(import.meta.url);`
      }
    }
    return {}
  },
})
```

Create `packages/core/drizzle.config.ts`:
```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: { url: './traces.db' },
})
```

Run `pnpm install` from repo root to install new deps.
  </action>
  <verify>
    `pnpm --filter @lens/core install` exits 0.
    `cat packages/core/package.json` shows `drizzle-orm` and `better-sqlite3` in dependencies.
    `packages/core/tsup.config.ts` exists with format-conditional banner.
  </verify>
  <done>All four config files exist and deps are installed.</done>
</task>

<task type="auto">
  <name>Task 2: Core implementation — context, lensFn, lensRoute, Logger, TraceStore, schema</name>
  <files>
    packages/core/src/context.ts
    packages/core/src/schema.ts
    packages/core/src/trace-store.ts
    packages/core/src/lens-fn.ts
    packages/core/src/lens-route.ts
    packages/core/src/logger.ts
    packages/core/src/index.ts
  </files>
  <action>
Create each file in this order (schema → trace-store → context → lens-fn → lens-route → logger → index):

**`packages/core/src/schema.ts`** — Drizzle SQLite schema (flat spans with parentSpanId, OpenTelemetry model):
```typescript
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const traces = sqliteTable('traces', {
  traceId: text('trace_id').primaryKey(),
  rootSpanName: text('root_span_name').notNull(),
  startedAt: integer('started_at').notNull(),  // Unix ms
  endedAt: integer('ended_at'),
  durationMs: real('duration_ms'),
})

export const spans = sqliteTable('spans', {
  spanId: text('span_id').primaryKey(),
  traceId: text('trace_id').notNull().references(() => traces.traceId, { onDelete: 'cascade' }),
  parentSpanId: text('parent_span_id'),
  name: text('name').notNull(),
  startedAt: integer('started_at').notNull(),
  durationMs: real('duration_ms'),
  errorMessage: text('error_message'),
  inputSize: integer('input_size'),
  outputSize: integer('output_size'),
})

export const logs = sqliteTable('logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  traceId: text('trace_id'),
  spanId: text('span_id'),
  level: text('level', { enum: ['info', 'warn', 'error', 'debug'] }).notNull(),
  message: text('message').notNull(),
  timestamp: integer('timestamp').notNull(),
})
```

**`packages/core/src/context.ts`** — AsyncLocalStorage store and types:
```typescript
import { AsyncLocalStorage } from 'node:async_hooks'

export interface Span {
  spanId: string
  parentSpanId: string | undefined
  name: string
  startMs: number
}

export interface TraceContext {
  traceId: string
  spanStack: Span[]
}

export const storage = new AsyncLocalStorage<TraceContext>()

/** Returns the deepest active span, or undefined if outside any lensFn/lensRoute context. */
export function currentSpan(): Span | undefined {
  const store = storage.getStore()
  return store?.spanStack.at(-1)
}
```

**`packages/core/src/trace-store.ts`** — Drizzle DB, WAL, batch flush, retention prune:
```typescript
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { lt } from 'drizzle-orm'
import * as schema from './schema.js'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface SpanRecord {
  spanId: string
  traceId: string
  parentSpanId: string | undefined
  name: string
  startedAt: number
  durationMs: number
  errorMessage?: string
  inputSize?: number
  outputSize?: number
}

export interface LogRecord {
  traceId?: string
  spanId?: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  timestamp: number
}

export class TraceStore {
  private db: ReturnType<typeof drizzle<typeof schema>>
  private sqlite: Database.Database
  private spanBuffer: SpanRecord[] = []
  private logBuffer: LogRecord[] = []
  private flushTimer: ReturnType<typeof setInterval>
  private pruneTimer: ReturnType<typeof setInterval>
  readonly retentionMs: number

  constructor(dbPath: string, retentionMs = 7 * 24 * 60 * 60 * 1000) {
    this.sqlite = new Database(dbPath)
    // WAL mode before anything else — critical for concurrent read performance
    this.sqlite.pragma('journal_mode = WAL')
    this.sqlite.pragma('synchronous = NORMAL')
    this.sqlite.pragma('foreign_keys = ON')

    this.db = drizzle(this.sqlite, { schema })

    // Migrations folder is co-located with the built package
    const migrationsFolder = join(__dirname, '..', 'drizzle')
    migrate(this.db, { migrationsFolder })

    this.retentionMs = retentionMs

    // Batch flush every 100ms — time-based batching, minimal complexity
    this.flushTimer = setInterval(() => this.flush(), 100)
    // Prune old traces hourly
    this.pruneTimer = setInterval(() => this.prune(), 60 * 60 * 1000)
  }

  pushSpan(span: SpanRecord): void {
    this.spanBuffer.push(span)
  }

  pushLog(log: LogRecord): void {
    this.logBuffer.push(log)
  }

  private flush(): void {
    if (this.spanBuffer.length === 0 && this.logBuffer.length === 0) return

    const spans = this.spanBuffer.splice(0)
    const logs = this.logBuffer.splice(0)

    // Group spans by trace; upsert traces first (foreign key constraint)
    const traceMap = new Map<string, { name: string; startedAt: number; endedAt: number; durationMs: number }>()
    for (const s of spans) {
      const existing = traceMap.get(s.traceId)
      if (!existing || s.startedAt < existing.startedAt) {
        traceMap.set(s.traceId, {
          name: s.parentSpanId == null ? s.name : existing?.name ?? s.name,
          startedAt: Math.min(s.startedAt, existing?.startedAt ?? s.startedAt),
          endedAt: Math.max(s.startedAt + s.durationMs, existing?.endedAt ?? 0),
          durationMs: s.durationMs,
        })
      }
    }

    this.sqlite.transaction(() => {
      for (const [traceId, t] of traceMap) {
        this.sqlite.prepare(
          `INSERT INTO traces (trace_id, root_span_name, started_at, ended_at, duration_ms)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(trace_id) DO UPDATE SET ended_at = excluded.ended_at, duration_ms = excluded.duration_ms`
        ).run(traceId, t.name, t.startedAt, t.endedAt, t.durationMs)
      }

      for (const s of spans) {
        this.sqlite.prepare(
          `INSERT OR IGNORE INTO spans (span_id, trace_id, parent_span_id, name, started_at, duration_ms, error_message, input_size, output_size)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(s.spanId, s.traceId, s.parentSpanId ?? null, s.name, s.startedAt, s.durationMs, s.errorMessage ?? null, s.inputSize ?? null, s.outputSize ?? null)
      }

      for (const l of logs) {
        this.sqlite.prepare(
          `INSERT INTO logs (trace_id, span_id, level, message, timestamp) VALUES (?, ?, ?, ?, ?)`
        ).run(l.traceId ?? null, l.spanId ?? null, l.level, l.message, l.timestamp)
      }
    })()
  }

  prune(): void {
    const cutoff = Date.now() - this.retentionMs
    // Cascade delete handles spans and logs via foreign key (or manual if needed)
    this.sqlite.prepare(`DELETE FROM traces WHERE started_at < ?`).run(cutoff)
    // Orphaned logs (no trace_id) older than retention
    this.sqlite.prepare(`DELETE FROM logs WHERE trace_id IS NULL AND timestamp < ?`).run(cutoff)
  }

  close(): void {
    clearInterval(this.flushTimer)
    clearInterval(this.pruneTimer)
    this.flush()
    this.sqlite.close()
  }
}

/** Factory — creates and returns a singleton-friendly TraceStore instance. */
export function createTraceStore(dbPath: string, retentionMs?: number): TraceStore {
  return new TraceStore(dbPath, retentionMs)
}
```

**`packages/core/src/lens-fn.ts`** — lensFn() with ALS context propagation:
```typescript
import { crypto } from 'node:crypto'  // Node 19+ — use randomUUID from crypto module
import { storage, type Span, type TraceContext } from './context.js'
import type { TraceStore } from './trace-store.js'

// Global TraceStore reference — set via configure() before first lensFn call
let _store: TraceStore | undefined

export function configureLensFn(store: TraceStore): void {
  _store = store
}

export function lensFn<TArgs extends unknown[], TReturn>(
  name: string,
  fn: (...args: TArgs) => Promise<TReturn>
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const parent = storage.getStore()
    const spanId = crypto.randomUUID()
    const traceId = parent?.traceId ?? crypto.randomUUID()

    const parentSpanId = parent?.spanStack.at(-1)?.spanId
    const span: Span = { spanId, parentSpanId, name, startMs: Date.now() }

    const ctx: TraceContext = {
      traceId,
      spanStack: parent ? [...parent.spanStack, span] : [span],
    }

    const startMs = Date.now()

    return storage.run(ctx, async () => {
      let errorMessage: string | undefined
      try {
        const result = await fn(...args)
        const inputSize = estimateSize(args)
        const outputSize = estimateSize(result)
        _store?.pushSpan({
          spanId,
          traceId,
          parentSpanId,
          name,
          startedAt: startMs,
          durationMs: Date.now() - startMs,
          inputSize,
          outputSize,
        })
        return result
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err)
        _store?.pushSpan({
          spanId,
          traceId,
          parentSpanId,
          name,
          startedAt: startMs,
          durationMs: Date.now() - startMs,
          errorMessage,
        })
        throw err
      }
    })
  }
}

function estimateSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0
  } catch {
    return 0
  }
}
```

Note: Use `import { randomUUID } from 'node:crypto'` (not `crypto.randomUUID()` — that's the Web Crypto API). Correct import:
```typescript
import { randomUUID } from 'node:crypto'
// then use: randomUUID()
```

**`packages/core/src/lens-route.ts`** — lensRoute() wraps Hono handlers:
```typescript
import { randomUUID } from 'node:crypto'
import type { Context, Handler, Env, Input } from 'hono'
import { storage, type TraceContext, type Span } from './context.js'
import type { TraceStore } from './trace-store.js'

let _store: TraceStore | undefined

export function configureLensRoute(store: TraceStore): void {
  _store = store
}

export function lensRoute<E extends Env = Env, P extends string = string, I extends Input = Input>(
  name: string,
  handler: Handler<E, P, I>
): Handler<E, P, I> {
  return async (c: Context<E, P, I>, next) => {
    const spanId = randomUUID()
    const traceId = randomUUID()
    const startMs = Date.now()

    const span: Span = { spanId, parentSpanId: undefined, name, startMs }
    const ctx: TraceContext = { traceId, spanStack: [span] }

    return storage.run(ctx, async () => {
      let status = 200
      try {
        await handler(c, next)
        status = c.res.status
      } catch (err) {
        _store?.pushSpan({
          spanId,
          traceId,
          parentSpanId: undefined,
          name,
          startedAt: startMs,
          durationMs: Date.now() - startMs,
          errorMessage: err instanceof Error ? err.message : String(err),
        })
        throw err
      }
      _store?.pushSpan({
        spanId,
        traceId,
        parentSpanId: undefined,
        name,
        startedAt: startMs,
        durationMs: Date.now() - startMs,
        inputSize: Number(c.req.header('content-length') ?? 0),
      })
    })
  }
}
```

**`packages/core/src/logger.ts`** — Logger with dual output (stderr + TraceStore):
```typescript
import { storage } from './context.js'
import type { TraceStore } from './trace-store.js'

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

let _store: TraceStore | undefined
let _jsonMode = false

export function configureLogger(store: TraceStore, jsonMode = false): void {
  _store = store
  _jsonMode = jsonMode
}

export const Logger = {
  info: (message: string) => log('info', message),
  warn: (message: string) => log('warn', message),
  error: (message: string) => log('error', message),
  debug: (message: string) => log('debug', message),
}

function log(level: LogLevel, message: string): void {
  const store = storage.getStore()
  const traceId = store?.traceId
  const spanId = store?.spanStack.at(-1)?.spanId
  const timestamp = Date.now()

  // Persist to TraceStore (async-safe: pushLog is synchronous buffer push)
  _store?.pushLog({ traceId, spanId, level, message, timestamp })

  // Write to stderr — NEVER stdout (MCP stdio uses stdout for JSON-RPC)
  const entry = _jsonMode
    ? JSON.stringify({ timestamp, level, message, traceId, spanId }) + '\n'
    : formatHuman(level, message, traceId, spanId)

  process.stderr.write(entry)
}

const LEVEL_LABELS: Record<LogLevel, string> = {
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
  debug: 'DBG',
}

function formatHuman(level: LogLevel, message: string, traceId?: string, spanId?: string): string {
  const ts = new Date().toISOString().slice(11, 23)  // HH:MM:SS.mmm
  const label = LEVEL_LABELS[level]
  const trace = traceId ? ` [${traceId.slice(0, 8)}]` : ''
  return `${ts} ${label}${trace} ${message}\n`
}
```

**`packages/core/src/index.ts`** — barrel export:
```typescript
export { lensFn, configureLensFn } from './lens-fn.js'
export { lensRoute, configureLensRoute } from './lens-route.js'
export { Logger, configureLogger } from './logger.js'
export { TraceStore, createTraceStore } from './trace-store.js'
export { storage, currentSpan } from './context.js'
export type { TraceContext, Span } from './context.js'
export type { SpanRecord, LogRecord } from './trace-store.js'
```

After writing all files, run `pnpm --filter @lens/core run db:generate` to produce the Drizzle migration SQL in `packages/core/drizzle/`.

Then run `pnpm --filter @lens/core build` to compile.

Finally run `pnpm --filter @lens/core typecheck` to confirm zero TS errors.
  </action>
  <verify>
    `pnpm --filter @lens/core build` exits 0 with no errors.
    `pnpm --filter @lens/core typecheck` exits 0.
    `ls packages/core/dist/` shows `index.js`, `index.cjs`, `index.d.ts`.
    `ls packages/core/drizzle/` shows at least one `.sql` migration file.
    `grep -r 'console.log' packages/core/src/` returns empty (no stdout writes).
  </verify>
  <done>
    `packages/core/dist/index.js` exports lensFn, lensRoute, Logger, TraceStore.
    Migration SQL exists in `packages/core/drizzle/`.
    Zero TypeScript errors.
    No `console.log` in src/.
  </done>
</task>

</tasks>

<verification>
Manual smoke test after build:

```typescript
// test-smoke.mts — run with: node --input-type=module < test-smoke.mts
import { lensFn, createTraceStore, configureLensFn, Logger, configureLogger } from './packages/core/dist/index.js'

const store = createTraceStore('/tmp/lens-test.db')
configureLensFn(store)
configureLogger(store)

const greet = lensFn('greet', async (name: string) => `hello ${name}`)
const result = await greet('world')
Logger.info('smoke test passed')
console.assert(result === 'hello world', 'greet returned wrong value')

store.close()
process.exit(0)
```

Expected: stderr shows `INF smoke test passed`, process exits 0, `/tmp/lens-test.db` contains rows in `spans` table.
</verification>

<success_criteria>
1. lensFn() wraps async functions with zero-config tracing — no manual span creation needed
2. Nested lensFn() calls produce correct parentSpanId chains in the database
3. Logger writes to stderr exclusively (verified by grep)
4. TraceStore uses WAL mode, batches writes at 100ms intervals, and prunes on schedule
5. `pnpm --filter @lens/core build` exits 0 producing ESM+CJS dual output
6. Zero TypeScript errors via `tsc --noEmit`
</success_criteria>

<output>
After completion, create `.planning/phases/01-core-daemon-mcp/01-01-SUMMARY.md` with:
- Key exports and their signatures
- TraceStore schema summary (table names, key columns)
- The configure*() pattern (how to wire store into lensFn/lensRoute/Logger)
- Any deviations from the plan and why
- Build output paths
</output>

---

---
phase: 01-core-daemon-mcp
plan: "02"
type: execute
wave: 2
depends_on: ["01-01"]
files_modified:
  - apps/daemon/package.json
  - apps/daemon/tsconfig.json
  - apps/daemon/tsup.config.ts
  - apps/daemon/src/index.ts
  - apps/daemon/src/http.ts
  - apps/daemon/src/mcp.ts
  - apps/daemon/src/routes/health.ts
autonomous: true
requirements:
  - DAEM-01
  - DAEM-02
  - DAEM-04

must_haves:
  truths:
    - "curl http://localhost:4111/health returns 200 JSON with status and uptime fields"
    - "All HTTP route handlers are wrapped in lensRoute() — grep for naked Hono handler patterns returns empty"
    - "The MCP server connects via stdio without crashing the HTTP server"
    - "No write to process.stdout in daemon src/ — all output goes to process.stderr or TraceStore"
    - "HTTP and MCP stdio run in the same process (single node invocation)"
    - "lensRoute() traces appear in TraceStore after an HTTP request"
  artifacts:
    - path: "apps/daemon/src/index.ts"
      provides: "Entry point starting HTTP + MCP"
      exports: []
    - path: "apps/daemon/src/http.ts"
      provides: "Hono app with health route"
      exports: ["app"]
    - path: "apps/daemon/src/mcp.ts"
      provides: "MCP stdio server with lens_context_query tool stub"
      exports: ["startMcpServer"]
    - path: "apps/daemon/src/routes/health.ts"
      provides: "GET /health handler wrapped in lensRoute()"
      exports: ["healthRoutes"]
  key_links:
    - from: "apps/daemon/src/index.ts"
      to: "apps/daemon/src/http.ts"
      via: "startHttpServer() call"
      pattern: "startHttpServer|serve"
    - from: "apps/daemon/src/index.ts"
      to: "apps/daemon/src/mcp.ts"
      via: "startMcpServer() call (awaited)"
      pattern: "startMcpServer"
    - from: "apps/daemon/src/routes/health.ts"
      to: "@lens/core lensRoute"
      via: "lensRoute() wrapping every handler"
      pattern: "lensRoute"
---

<objective>
Build the `@lens/daemon` skeleton: Hono HTTP server on :4111 with health route, MCP stdio server with a stub `lens_context_query` tool, all routes wrapped in lensRoute(), no stdout writes.

Purpose: Establishes the HTTP + MCP process shape that Phase 2 engine routes plug into. The tool stub in plan 02 exists to support the adoption benchmark in plan 04 — it must be discoverable and callable even if its response is minimal.
Output: `apps/daemon/dist/index.js` — a Node.js process that serves HTTP on :4111 and MCP on stdio simultaneously.
</objective>

<execution_context>
@/Users/jalipalo/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jalipalo/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/01-core-daemon-mcp/01-01-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Daemon package scaffold — deps, tsconfig, tsup</name>
  <files>
    apps/daemon/package.json
    apps/daemon/tsconfig.json
    apps/daemon/tsup.config.ts
  </files>
  <action>
Update `apps/daemon/package.json`:
```json
{
  "name": "@lens/daemon",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@lens/core": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.26.0",
    "hono": "^4.11.10",
    "@hono/node-server": "^1.19.9",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "tsup": "^8.5.0",
    "typescript": "^5.7.0"
  }
}
```

Create `apps/daemon/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `apps/daemon/tsup.config.ts`:
```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  // No CJS needed — daemon is a Node process, not a library
  // No createRequire banner needed — core package handles better-sqlite3 internally
  dts: false,
  splitting: false,
  clean: true,
  // Externalize workspace packages — they ship their own builds
  external: ['@lens/core'],
})
```

Run `pnpm install` from repo root.
  </action>
  <verify>
    `cat apps/daemon/package.json` shows `@modelcontextprotocol/sdk`, `hono`, `@hono/node-server`, `zod`.
    `apps/daemon/tsup.config.ts` exists with `format: ['esm']`.
  </verify>
  <done>Daemon package.json, tsconfig.json, and tsup.config.ts exist with correct content. Deps installed.</done>
</task>

<task type="auto">
  <name>Task 2: Daemon implementation — HTTP server, MCP server, health route</name>
  <files>
    apps/daemon/src/routes/health.ts
    apps/daemon/src/http.ts
    apps/daemon/src/mcp.ts
    apps/daemon/src/index.ts
  </files>
  <action>
Create files in dependency order: health route → http → mcp → index.

**`apps/daemon/src/routes/health.ts`** — GET /health, wrapped in lensRoute():
```typescript
import { Hono } from 'hono'
import { lensRoute } from '@lens/core'

const startedAt = Date.now()

export const healthRoutes = new Hono()

healthRoutes.get(
  '/',
  lensRoute('health.get', async (c) => {
    return c.json({
      status: 'ok',
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      version: '2.0.0',
    })
  })
)
```

**`apps/daemon/src/http.ts`** — Hono app with error handler and route mounting:
```typescript
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { serve } from '@hono/node-server'
import { healthRoutes } from './routes/health.js'

export const app = new Hono()

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  // stderr — never stdout
  process.stderr.write(`[daemon] unhandled error: ${err.message}\n`)
  return c.json({ error: 'Internal server error' }, 500)
})

app.route('/health', healthRoutes)

export function startHttpServer(): void {
  serve({ fetch: app.fetch, port: 4111 }, (info) => {
    process.stderr.write(`[daemon] HTTP server listening on :${info.port}\n`)
  })
}
```

**`apps/daemon/src/mcp.ts`** — MCP stdio server with stub lens_context_query tool:

The tool must be real enough that an agent can discover and invoke it. Response can be minimal in Phase 1 — Phase 2 connects it to the full engine.

Tool description follows the verb-first formula: action + noun + what it returns. Parameters use rich Zod `.describe()` so agents know exactly what to pass.

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: 'lens',
    version: '2.0.0',
  })

  server.registerTool(
    'lens_context_query',
    {
      title: 'LENS Context Query',
      // Verb-first, 1-2 sentences. Operational detail in parameter .describe() — not here.
      description:
        'Query a codebase by keyword and get structural context: which files match, their importers, co-change partners, and hub scores. Use this when you need to understand where a symbol or concept lives in the repo graph.',
      inputSchema: {
        repoPath: z
          .string()
          .describe('Absolute path to the repository root (e.g. /Users/dev/myproject)'),
        query: z
          .string()
          .describe(
            'Search terms space-separated. All terms matched with AND logic. Example: "authMiddleware validate token"'
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(20)
          .describe('Max results to return. Default 20, max 50.'),
      },
    },
    async ({ repoPath, query, limit }) => {
      // Phase 1 stub — Phase 2 replaces this with real engine query
      // Daemon is not running an engine yet; return structured placeholder
      const response = {
        repoPath,
        query,
        limit,
        results: [],
        note: 'LENS engine not yet indexed. Run `lens register <path>` then `lens index` to populate.',
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      }
    }
  )

  const transport = new StdioServerTransport()
  // connect() takes over stdin/stdout for JSON-RPC — must be last thing called
  await server.connect(transport)
}
```

**`apps/daemon/src/index.ts`** — Entry point wiring TraceStore + HTTP + MCP:
```typescript
import { createTraceStore, configureLensFn, configureLensRoute, configureLogger } from '@lens/core'
import { startHttpServer } from './http.js'
import { startMcpServer } from './mcp.js'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DATA_DIR = process.env['LENS_DATA_DIR'] ?? join(homedir(), '.lens')
const TRACE_DB = join(DATA_DIR, 'traces.db')
const JSON_LOGS = process.argv.includes('--json')

async function main(): Promise<void> {
  // TraceStore must be created before any lensFn/lensRoute calls
  const store = createTraceStore(TRACE_DB)
  configureLensFn(store)
  configureLensRoute(store)
  configureLogger(store, JSON_LOGS)

  // HTTP server is non-blocking — returns immediately, event loop handles requests
  startHttpServer()

  // MCP stdio takes over stdin/stdout — must be called after HTTP is started
  // In non-MCP mode (e.g., direct curl testing), omit this call
  if (process.env['LENS_MCP'] !== 'false') {
    await startMcpServer()
  }
}

main().catch((err) => {
  process.stderr.write(`[daemon] fatal: ${String(err)}\n`)
  process.exit(1)
})
```

Note on DATA_DIR: The `~/.lens/` directory must exist before TraceStore opens the DB. Add `mkdirSync(DATA_DIR, { recursive: true })` before `createTraceStore()`:
```typescript
import { mkdirSync } from 'node:fs'
// ...
mkdirSync(DATA_DIR, { recursive: true })
const store = createTraceStore(TRACE_DB)
```

After all files are written:
1. Run `pnpm --filter @lens/daemon build`
2. Run `pnpm --filter @lens/daemon typecheck`
3. Verify with `grep -r 'console.log\|process.stdout.write' apps/daemon/src/` — must return empty
  </action>
  <verify>
    `pnpm --filter @lens/daemon build` exits 0.
    `pnpm --filter @lens/daemon typecheck` exits 0.
    `grep -r 'console\.log\|process\.stdout\.write' apps/daemon/src/` returns empty.
    `LENS_MCP=false node apps/daemon/dist/index.js &amp; sleep 1 &amp;&amp; curl -s http://localhost:4111/health | jq .status` returns `"ok"`.
    Kill the daemon after test: `kill %1`.
  </verify>
  <done>
    Daemon builds and starts on :4111.
    /health returns 200 with status and uptime.
    No stdout writes in daemon src.
    MCP server is registered with lens_context_query tool.
  </done>
</task>

</tasks>

<verification>
Full daemon integration test:
```bash
# Start daemon in HTTP-only mode (no MCP stdio takeover)
LENS_MCP=false node apps/daemon/dist/index.js &
sleep 1

# Health check
curl -s http://localhost:4111/health
# Expected: {"status":"ok","uptime":...,"version":"2.0.0"}

# Verify TraceStore received a span (check DB)
sqlite3 ~/.lens/traces.db "SELECT name, duration_ms FROM spans LIMIT 5;"
# Expected: health.get|<number>

kill %1
```
</verification>

<success_criteria>
1. `curl http://localhost:4111/health` returns 200 JSON — daemon is alive
2. Every route handler goes through lensRoute() — confirmed by source grep
3. TraceStore receives spans from HTTP requests — verified via sqlite3 query
4. No stdout writes — verified by grep
5. Single process runs HTTP + MCP on separate I/O channels
</success_criteria>

<output>
After completion, create `.planning/phases/01-core-daemon-mcp/01-02-SUMMARY.md` with:
- Route structure and how to add new routes (lensRoute pattern)
- MCP tool name: `lens_context_query` and current stub behavior
- How to start the daemon (with and without MCP mode)
- Data directory location (`~/.lens/`)
- Any deviations from the plan and why
</output>

---

---
phase: 01-core-daemon-mcp
plan: "03"
type: execute
wave: 2
depends_on: ["01-01"]
files_modified:
  - packages/cli/package.json
  - packages/cli/tsconfig.json
  - packages/cli/tsup.config.ts
  - packages/cli/src/index.ts
autonomous: true
requirements:
  - CLI-01

must_haves:
  truths:
    - "`lens status` prints daemon status to stdout (not stderr) when daemon is running on :4111"
    - "`lens status` exits 0 with a clear error message (not a stack trace) when daemon is not running"
    - "`lens --help` prints usage without crashing"
    - "The `lens` binary is runnable after `pnpm --filter @lens/cli build`"
  artifacts:
    - path: "packages/cli/src/index.ts"
      provides: "citty CLI with status subcommand"
      exports: []
  key_links:
    - from: "packages/cli/src/index.ts"
      to: "http://localhost:4111/health"
      via: "fetch() call in status subcommand"
      pattern: "fetch.*4111|fetch.*health"
---

<objective>
Build the `@lens/cli` skeleton: citty argument parser, `lens status` subcommand that calls the daemon health endpoint and prints output gracefully whether daemon is up or down.

Purpose: Thin CLI shell pattern that Phase 3 fills with `grep`, `register`, `remove`, `list` commands. Establishes the fetch-to-daemon pattern with clean error handling.
Output: `packages/cli/dist/index.js` — executable as `lens` binary.
</objective>

<execution_context>
@/Users/jalipalo/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jalipalo/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/01-core-daemon-mcp/01-01-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: CLI scaffold + implementation</name>
  <files>
    packages/cli/package.json
    packages/cli/tsconfig.json
    packages/cli/tsup.config.ts
    packages/cli/src/index.ts
  </files>
  <action>
Update `packages/cli/package.json`:
```json
{
  "name": "@lens/cli",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "bin": {
    "lens": "./dist/index.js"
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "citty": "^0.2.1"
  },
  "devDependencies": {
    "tsup": "^8.5.0",
    "typescript": "^5.7.0"
  }
}
```

Create `packages/cli/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `packages/cli/tsup.config.ts`:
```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  splitting: false,
  clean: true,
  // Add shebang so the binary is directly executable
  banner: {
    js: '#!/usr/bin/env node',
  },
})
```

Create `packages/cli/src/index.ts`:
```typescript
import { defineCommand, runMain } from 'citty'

const DAEMON_URL = 'http://localhost:4111'

const status = defineCommand({
  meta: {
    description: 'Show daemon status. Exits 0 if running, 1 if not reachable.',
  },
  async run() {
    try {
      const res = await fetch(`${DAEMON_URL}/health`)
      if (!res.ok) {
        console.error(`Daemon returned HTTP ${res.status}`)
        process.exit(1)
      }
      const data = (await res.json()) as { status: string; uptime: number; version: string }
      console.log(`lens daemon ${data.version}`)
      console.log(`  status : ${data.status}`)
      console.log(`  uptime : ${data.uptime}s`)
      console.log(`  url    : ${DAEMON_URL}`)
    } catch {
      // fetch throws on connection refused — daemon not running
      console.error('lens daemon is not running. Start it with: lens daemon start')
      process.exit(1)
    }
  },
})

const main = defineCommand({
  meta: {
    name: 'lens',
    version: '2.0.0',
    description: 'LENS — structured code query engine',
  },
  subCommands: {
    status,
  },
})

runMain(main)
```

After writing all files:
1. `pnpm install` from repo root
2. `pnpm --filter @lens/cli build`
3. `pnpm --filter @lens/cli typecheck`
  </action>
  <verify>
    `pnpm --filter @lens/cli build` exits 0.
    `pnpm --filter @lens/cli typecheck` exits 0.
    `node packages/cli/dist/index.js --help` prints usage without crashing.
    `node packages/cli/dist/index.js status` (daemon not running) exits 1 and prints a human-readable error message — no stack trace.
    If daemon is running: `node packages/cli/dist/index.js status` exits 0 and prints version, status, uptime.
  </verify>
  <done>
    `lens` binary builds and runs.
    `lens status` handles daemon-up and daemon-down cases gracefully.
    Zero TS errors.
  </done>
</task>

</tasks>

<verification>
```bash
# Build CLI
pnpm --filter @lens/cli build

# Test with daemon NOT running (expected: exits 1 with message)
node packages/cli/dist/index.js status
echo "Exit code: $?"

# Test --help (expected: exits 0 with usage)
node packages/cli/dist/index.js --help
echo "Exit code: $?"
```
</verification>

<success_criteria>
1. `lens --help` works without crashing
2. `lens status` with daemon down: human-readable error, exit code 1
3. `lens status` with daemon up: prints version, status, uptime
4. No uncaught exceptions — all errors handled
</success_criteria>

<output>
After completion, create `.planning/phases/01-core-daemon-mcp/01-03-SUMMARY.md` with:
- CLI binary path and how to invoke
- Pattern for adding new subcommands (for Phase 3 reference)
- DAEMON_URL constant location
- Any deviations from the plan
</output>

---

---
phase: 01-core-daemon-mcp
plan: "04"
type: execute
wave: 3
depends_on: ["01-02", "01-03"]
files_modified:
  - apps/daemon/src/mcp.ts
autonomous: false
requirements:
  - DAEM-02

must_haves:
  truths:
    - "Claude Code (or Cursor) auto-discovers the MCP server when pointed at the daemon"
    - "The lens_context_query tool is invoked at least once during a benchmark session against an unfamiliar repo"
    - "Tool adoption rate is above 0/N across 3+ benchmark repos"
    - "If adoption rate is below 100%, tool description and parameter schema are iterated until adoption improves"
  artifacts:
    - path: "apps/daemon/src/mcp.ts"
      provides: "Final tool description and schema after iteration"
      contains: "lens_context_query"
  key_links:
    - from: "Claude Code / Cursor agent"
      to: "apps/daemon/src/mcp.ts"
      via: "MCP stdio auto-discovery from .mcp.json or claude_desktop_config.json"
      pattern: "lens_context_query"
---

<objective>
Validate MCP tool adoption empirically: configure Claude Code (or Cursor) to use the LENS daemon as an MCP server, run benchmark sessions against 3+ unfamiliar repos, observe whether the tool is called, iterate tool description if not adopted.

Purpose: v1 had 0/9 adoption. This is the phase gate. Do NOT advance to Phase 2 until at least 1 adoption is confirmed. Adoption here means the agent autonomously calls `lens_context_query` during a real coding task without being told to — not prompted.
Output: Revised `apps/daemon/src/mcp.ts` with empirically validated tool design. Gate decision recorded in SUMMARY.
</objective>

<execution_context>
@/Users/jalipalo/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jalipalo/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/01-core-daemon-mcp/01-02-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: MCP server registration — configure daemon as MCP provider for Claude Code</name>
  <files>
    apps/daemon/src/mcp.ts
  </files>
  <action>
Verify and harden the MCP server registration so Claude Code can auto-discover it.

Step 1 — Create `.mcp.json` in the repo root for Claude Code auto-discovery:
```json
{
  "mcpServers": {
    "lens": {
      "command": "node",
      "args": ["apps/daemon/dist/index.js"],
      "env": {
        "LENS_DATA_DIR": "${HOME}/.lens"
      }
    }
  }
}
```

Step 2 — Rebuild daemon if any changes were made since plan 02:
```bash
pnpm --filter @lens/daemon build
```

Step 3 — Verify the MCP server starts cleanly and lists tools:
```bash
# Use the MCP inspector to verify tool registration
# Run daemon in MCP mode and send a tools/list request manually:
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node apps/daemon/dist/index.js
# Expected output on stdout: JSON response containing lens_context_query in tools array
# Stderr should show: [daemon] HTTP server listening on :4111
```

Step 4 — Verify tool schema is complete and parseable. The `lens_context_query` tool must have:
- `name`: `"lens_context_query"`
- `description`: starts with an action verb, 1-2 sentences max
- `inputSchema`: `repoPath` (string, required), `query` (string, required), `limit` (integer, optional)
- Each parameter has a `.describe()` with concrete examples

If the manual tools/list JSON is malformed or missing the tool, fix `apps/daemon/src/mcp.ts` before proceeding to the benchmark checkpoint.
  </action>
  <verify>
    `.mcp.json` exists at repo root with correct daemon command.
    `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node apps/daemon/dist/index.js` outputs a JSON response on stdout containing `"name":"lens_context_query"`.
    Tool description in the JSON response starts with a verb and is under 200 characters.
    All three parameters (`repoPath`, `query`, `limit`) appear in the `inputSchema` with descriptions.
  </verify>
  <done>MCP server is registered, tool appears in tools/list JSON, .mcp.json exists for agent auto-discovery.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    MCP daemon with lens_context_query tool. .mcp.json configured for Claude Code auto-discovery.
    The tool accepts repoPath + query, returns a structured JSON response (currently a stub indicating the engine is not yet indexed).
  </what-built>
  <how-to-verify>
    Run 3+ benchmark sessions. Each session: open Claude Code in an UNFAMILIAR repo (not this one), give a realistic coding task that requires understanding the codebase structure (e.g., "Where is the auth middleware applied? What files import it?"), and observe whether the agent calls lens_context_query without being prompted.

    **Benchmark Protocol:**
    1. Start daemon: `LENS_MCP=false node apps/daemon/dist/index.js &amp;` (HTTP only for now is fine — MCP auto-starts via .mcp.json when Claude Code spawns it)
    2. Open Claude Code in an unfamiliar repo (suggestion: a popular OSS repo you haven't worked in)
    3. Ask a structural question: "Find all places where the database connection is used and what modules depend on it"
    4. Watch the tool use panel — did Claude call lens_context_query?
    5. Record: repo name, task given, tool called (yes/no), if no — what tools did Claude use instead?

    **Iteration criteria:**
    - If adoption rate is 0/3: the tool description or schema is the problem. Try these changes in order:
      a. Make the description more imperative: "Use this tool to find where any symbol, function, or concept lives in the codebase graph"
      b. Rename to something more obvious: `search_codebase` or `find_code_context`
      c. Add `annotations.audience: ["agent"]` to tool registration if SDK supports it
    - After each change: rebuild daemon, re-run 1-2 benchmark sessions
    - Continue until at least 1/3 adoption is achieved

    **Adoption confirmed when:** Tool is called at least once in N sessions without user instruction. Record final N and adoption count.
  </how-to-verify>
  <resume-signal>
    Type "adopted: X/N" (e.g., "adopted: 2/3") when done. If you changed the tool description, paste the final description that achieved adoption. If adoption could not be confirmed after 3+ iterations, type "blocked: [description of what was tried]" and we will discuss before Phase 2.
  </resume-signal>
</task>

</tasks>

<verification>
Gate criteria (ALL must be true before Phase 2 begins):

1. `lens_context_query` appears in Claude Code tool list without manual configuration
2. At least 1 unprompted tool invocation recorded across 3+ benchmark sessions
3. Final tool description and schema are committed to `apps/daemon/src/mcp.ts`
4. Adoption data (N sessions, M calls) recorded in 01-04-SUMMARY.md

If gate FAILS (0/N adoption after multiple iterations):
- Do not start Phase 2
- Review tool naming, description, schema verbosity
- Consider: is the tool being discovered at all? Check Claude Code MCP panel.
- Escalate: discuss with user before proceeding
</verification>

<success_criteria>
Gate PASSES when:
- Adoption rate > 0/N (at least 1 call in N sessions, N >= 3)
- Tool description is verb-first, under 200 chars, no parameter detail in description body
- .mcp.json committed and working
- 01-04-SUMMARY.md records: sessions run, adoption count, final tool description, any iterations made
</success_criteria>

<output>
After completion, create `.planning/phases/01-core-daemon-mcp/01-04-SUMMARY.md` with:
- GATE RESULT: PASSED or FAILED
- Sessions run: N
- Tool invocations: M
- Adoption rate: M/N
- Final tool description (the exact string in mcp.ts)
- Iterations made (if any): what was tried, what worked
- Decision: "Phase 2 may proceed" or "Phase 2 blocked pending [action]"
</output>