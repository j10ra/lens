# Phase 1: Core + Daemon + MCP - Research

**Researched:** 2026-02-19
**Domain:** Observability framework, SQLite tracing, Hono HTTP, MCP stdio, CLI
**Confidence:** HIGH (core stack verified against official docs and npm current versions)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Logger Design**
- Inside `lensFn()` → logs auto-attach to active span (traceId + spanId). Outside → standalone structured output.
- Dual output: stdout AND SQLite persistence (TraceStore)
- Minimal fields per entry: timestamp, level, message, traceId, spanId
- Stdout format: human-readable by default, `--json` flag for structured JSON (one object per line, pipe to jq)
- Levels: info, warn, error, debug

### Claude's Discretion

- `lensFn()` / `lensRoute()` API shape — sync vs async, ctx object design, span nesting model
- Trace storage schema — flat vs hierarchical spans, what fields per trace/span
- MCP tool naming and description — follow Anthropic's published tool design guidance
- Trace retention policy — default window, prune strategy
- Daemon route structure and error responses
- CLI argument parser choice

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CORE-01 | `lensFn()` wraps any function with auto-tracing (duration, input/output size, nested spans, errors) | AsyncLocalStorage pattern for implicit ctx; span nesting via stack in ALS store |
| CORE-02 | `lensRoute()` wraps Hono handlers with request-level tracing (method, path, status, duration) | Hono middleware pattern; `await next()` timing; `c.res.status` post-handler |
| CORE-03 | Structured Logger with levels correlated to active trace | ALS `getStore()` provides current traceId/spanId; dual write to stdout + SQLite |
| CORE-04 | TraceStore persists traces to SQLite via Drizzle with queryable schema | Drizzle + better-sqlite3 setup verified; `migrate()` runs at startup |
| CORE-05 | Drizzle ORM configured for SQLite with better-sqlite3 driver, migrations support | `drizzle-orm/better-sqlite3` + `drizzle-kit generate` → `migrate()` pattern |
| CORE-06 | Trace retention policy (auto-prune old traces) | better-sqlite3 synchronous DELETE with prepared statement; setInterval prune |
| DAEM-01 | Hono HTTP server on :4111 with JSON API | `@hono/node-server` `serve()` with `port: 4111`; `app.route()` for modular routes |
| DAEM-02 | MCP stdio server exposing engine capabilities as tools | `McpServer` + `StdioServerTransport`; `server.registerTool()` with Zod inputSchema |
| DAEM-04 | All routes wrapped in `lensRoute()` — no naked handlers | `lensRoute()` is a factory returning a Hono handler; wraps `await next()` with timing |
| CLI-01 | Thin CLI shell that calls daemon HTTP API | citty `defineCommand` + `runMain`; `fetch()` to localhost:4111 |
</phase_requirements>

---

## Summary

Phase 1 builds the entire observable infrastructure that all subsequent phases run inside. Every function in the engine and every HTTP route in the daemon will be wrapped by primitives defined here — `lensFn()`, `lensRoute()`, Logger, and TraceStore. The key design challenge is making this feel like Encore.ts's zero-config DX: calling `ctx.log.info()` inside any wrapped function just works, with no explicit context threading.

The central mechanism is `AsyncLocalStorage` (Node.js built-in, stable since v16). When `lensFn()` enters a new span, it runs the wrapped function inside `storage.run({ traceId, spanId, ... })`. Any code downstream — including nested `lensFn()` calls — can call `storage.getStore()` to get the current trace context without it being passed as an argument. This is exactly how Encore.ts works. The Encore blog post on this pattern confirms it is the right approach.

The MCP adoption problem (0/9 in v1) was the existential risk. Research confirms the failure mode: tool descriptions that are vague or buried cause agents to ignore tools. The fix is concrete: front-load the verb, keep descriptions to 1-2 sentences, put operational details in Zod parameter `.describe()`, not in the tool description. The phase gate (plan 04) of running adoption benchmarks before advancing to Phase 2 is the right call.

**Primary recommendation:** Use AsyncLocalStorage for implicit context propagation, Drizzle with better-sqlite3 for TraceStore, and write MCP tool descriptions with a verb-first 1-sentence structure + rich Zod `.describe()` per parameter.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | 1.26.0 | MCP stdio server | Official SDK; v1.x stable; `server.registerTool()` is current API |
| `drizzle-orm` | 0.45.1 | SQLite ORM for TraceStore | Type-safe, fast, programmatic migrations via `migrate()` |
| `drizzle-kit` | 0.31.9 | Migration generation CLI | Pairs with drizzle-orm; generates SQL from TypeScript schema |
| `better-sqlite3` | 12.6.2 | SQLite driver | Synchronous, 10x faster than async alternatives, Node-native |
| `hono` | 4.11.10 | HTTP daemon framework | Ultralight, web-standard, excellent TypeScript types |
| `@hono/node-server` | 1.19.9 | Node.js adapter for Hono | Required for Node runtime; `serve()` function |
| `zod` | 3.x | MCP input schema validation | Required by MCP SDK `registerTool()`; runtime + compile-time safety |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `citty` | 0.2.1 | CLI argument parser | Phase 1 CLI-01; minimal, TypeScript-first, supports subcommands |
| `@types/better-sqlite3` | latest | TypeScript types for better-sqlite3 | Dev dep; needed for typed Database instance |
| `tsup` | 8.5.0 | Build tool for packages | Current standard; ESM+CJS dual output; banner injection for native addons |

**Note on tsup:** The tsup GitHub README notes the project is "no longer actively maintained" and recommends migrating to [tsdown](https://github.com/rolldown/tsdown/). However, tsup 8.5.x is still stable, widely used, and fully functional. Given the project's existing `onlyBuiltDependencies` and tsup usage, stay with tsup for Phase 1 and evaluate tsdown migration later. (LOW confidence on maintenance concern — no breaking issues reported.)

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `citty` | `commander` | commander is more mature, heavier; citty is smaller, more TypeScript-native |
| `citty` | `yargs` | yargs is 128KB+, TypeScript support requires extra work |
| `drizzle-orm` | raw better-sqlite3 | Drizzle adds type safety and migrations; negligible overhead for trace writes |
| `AsyncLocalStorage` | explicit ctx parameter | ALS is implicit/ergonomic; explicit ctx is opt-in — ALS is correct for Encore-like DX |

**Installation:**
```bash
# packages/core
pnpm add drizzle-orm better-sqlite3
pnpm add -D drizzle-kit @types/better-sqlite3 zod

# apps/daemon
pnpm add hono @hono/node-server @modelcontextprotocol/sdk zod

# packages/cli
pnpm add citty
```

---

## Architecture Patterns

### Recommended Project Structure

```
packages/core/
├── src/
│   ├── index.ts          ← exports: lensFn, lensRoute, Logger, TraceStore
│   ├── context.ts        ← AsyncLocalStorage store, TraceContext type
│   ├── lens-fn.ts        ← lensFn() implementation
│   ├── lens-route.ts     ← lensRoute() implementation
│   ├── logger.ts         ← Logger class, dual write
│   ├── trace-store.ts    ← TraceStore, Drizzle DB, migrations
│   └── schema.ts         ← Drizzle SQLite schema for traces/spans/logs

apps/daemon/
├── src/
│   ├── index.ts          ← entry: start HTTP + MCP
│   ├── http.ts           ← Hono app, routes mounted, lensRoute wrapped
│   ├── mcp.ts            ← McpServer, StdioServerTransport, registerTool()
│   └── routes/
│       └── health.ts     ← GET /health (example route module)

packages/cli/
└── src/
    └── index.ts          ← citty defineCommand + runMain, calls :4111
```

### Pattern 1: AsyncLocalStorage for Implicit Context (lensFn)

**What:** Wrap every engine/core function call in `storage.run()` to make trace context available to all downstream code without parameter threading.

**When to use:** Every `lensFn()` call and every `lensRoute()` call establishes a span; nested calls inherit parent context and push a child span onto the span stack.

**Example:**
```typescript
// Source: https://encore.dev/blog/tracing-typescripts-trails + Node.js docs
import { AsyncLocalStorage } from 'node:async_hooks'

interface TraceContext {
  traceId: string
  spanStack: Array<{ spanId: string; name: string; startMs: number }>
}

const storage = new AsyncLocalStorage<TraceContext>()

export function lensFn<TArgs extends unknown[], TReturn>(
  name: string,
  fn: (...args: TArgs) => Promise<TReturn>
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const parent = storage.getStore()
    const spanId = crypto.randomUUID()
    const traceId = parent?.traceId ?? crypto.randomUUID()
    const span = { spanId, name, startMs: Date.now() }

    const ctx: TraceContext = parent
      ? { traceId, spanStack: [...parent.spanStack, span] }
      : { traceId, spanStack: [span] }

    return storage.run(ctx, async () => {
      try {
        const result = await fn(...args)
        // persist span on success
        return result
      } catch (err) {
        // persist span with error
        throw err
      }
    })
  }
}
```

### Pattern 2: Drizzle + better-sqlite3 Setup

**What:** Define schema in TypeScript, generate migrations with drizzle-kit, apply at startup with `migrate()`.

**Example:**
```typescript
// Source: https://orm.drizzle.team/docs/get-started-sqlite
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema.js'

export function createTraceStore(dbPath: string) {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')  // critical for performance
  sqlite.pragma('synchronous = NORMAL')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './drizzle' })
  return { db, sqlite }
}
```

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: { url: './traces.db' }
})
```

### Pattern 3: MCP Server with registerTool

**What:** `McpServer` instance with `StdioServerTransport`. Register tools using `server.registerTool()` with Zod-defined inputSchema.

**Critical:** Never write to stdout in a stdio MCP server — it corrupts JSON-RPC. All logging must go to stderr or SQLite.

**Example:**
```typescript
// Source: https://modelcontextprotocol.io/docs/develop/build-server
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({ name: 'lens', version: '2.0.0' })

server.registerTool(
  'lens_query',
  {
    title: 'LENS Code Query',
    description: 'Query a repo by keyword. Returns ranked files with structural context (imports, co-change, hub score).',
    inputSchema: {
      repoPath: z.string().describe('Absolute path to the repository root'),
      query: z.string().describe('Search terms (space-separated, combined with AND logic)'),
    }
  },
  async ({ repoPath, query }) => {
    // call engine via HTTP or direct
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
```

### Pattern 4: Hono HTTP Daemon with lensRoute

**What:** Hono app on port 4111. Routes in separate files, mounted via `app.route()`. Every handler is wrapped by `lensRoute()`.

**Example:**
```typescript
// Source: https://hono.dev/docs/getting-started/nodejs
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'

const app = new Hono()

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  return c.json({ error: err.message }, 500)
})

app.route('/health', healthRoutes)

serve({ fetch: app.fetch, port: 4111 }, (info) => {
  process.stderr.write(`Daemon listening on :${info.port}\n`)
})
```

```typescript
// lensRoute wraps a Hono handler
export function lensRoute<E extends Env, P extends string>(
  name: string,
  handler: Handler<E, P>
): Handler<E, P> {
  return async (c, next) => {
    const spanId = crypto.randomUUID()
    const traceId = crypto.randomUUID()
    const startMs = Date.now()
    // run handler inside ALS context
    return storage.run({ traceId, spanStack: [{ spanId, name, startMs }] }, async () => {
      try {
        await handler(c, next)
        // record span: method, path, status, duration
      } catch (err) {
        throw err
      }
    })
  }
}
```

### Pattern 5: Running MCP stdio alongside HTTP

Both run in the same Node.js process on separate I/O channels. HTTP uses `@hono/node-server`'s TCP socket. MCP uses stdin/stdout. They do not conflict.

```typescript
// apps/daemon/src/index.ts
async function main() {
  // Start HTTP server (non-blocking)
  startHttpServer()  // serve() returns immediately, event loop handles requests

  // Start MCP stdio (takes over stdin/stdout for JSON-RPC)
  await startMcpServer()
}
main().catch(err => { process.stderr.write(String(err)); process.exit(1) })
```

### Anti-Patterns to Avoid

- **console.log() in daemon process**: Corrupts MCP stdio JSON-RPC. Use `process.stderr.write()` or Logger (which writes to stderr or SQLite).
- **Naked exported functions in engine**: Every engine export must be `lensFn()`-wrapped. Non-wrapped exports bypass tracing silently.
- **Fat tool descriptions**: Do not put parameter constraints, defaults, or auth requirements in `description`. Use Zod `.describe()` per parameter instead.
- **Blocking WAL pragma**: Must set `journal_mode = WAL` after opening DB connection, before any writes. Default mode causes write contention.
- **Unbounded trace growth**: SQLite DB grows forever without a prune job. Must implement from Phase 1.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Context propagation across async calls | Custom context map with WeakRef | `AsyncLocalStorage` | Native Node.js, handles all async patterns (promises, timers, events), ~7% overhead |
| SQLite schema migrations | Raw `CREATE TABLE IF NOT EXISTS` | Drizzle-kit + `migrate()` | Schema drift, no column additions, no rollback |
| MCP JSON-RPC protocol | Custom stdio parser | `@modelcontextprotocol/sdk` | Protocol negotiation, capability handshake, tool listing, error codes |
| MCP input validation | Manual type checks | Zod via `registerTool()` | Schema is sent to agent for discovery; validation is automatic |
| Hono error responses | if/else in every handler | `HTTPException` + `app.onError` | Consistent JSON error shape, proper status codes |

**Key insight:** AsyncLocalStorage is the most important "don't hand-roll" item. It handles edge cases that a naive context map cannot: code that spawns timers, runs in `setImmediate`, or uses `EventEmitter` — all inherit the correct context automatically.

---

## Common Pitfalls

### Pitfall 1: stdout corruption in MCP stdio server
**What goes wrong:** Any write to process.stdout (including `console.log()`) corrupts the JSON-RPC stream. The MCP client will crash or silently drop the connection.
**Why it happens:** stdio transport uses process.stdin/stdout for binary JSON-RPC framing. Any extra bytes break the framing.
**How to avoid:** Logger must write human-readable output to `process.stderr`, never `process.stdout`. Verify with `grep -r 'console.log' apps/daemon/src` in CI.
**Warning signs:** MCP client connects but immediately disconnects; `tools/list` returns empty.

### Pitfall 2: better-sqlite3 WAL mode not set
**What goes wrong:** Write performance degrades dramatically under any concurrent read activity. Trace inserts block on reads.
**Why it happens:** Default journal mode uses exclusive write locks. WAL allows concurrent readers.
**How to avoid:** Set immediately after `new Database(path)`: `sqlite.pragma('journal_mode = WAL')`.
**Warning signs:** Trace writes noticeably slow (>10ms per insert) when daemon is handling requests.

### Pitfall 3: better-sqlite3 in ESM bundle without createRequire banner
**What goes wrong:** `require is not defined in ES module scope` at runtime. better-sqlite3 is a native CJS addon that uses synchronous `require()` internally.
**Why it happens:** ESM modules don't have `require` in scope; native addons need it.
**How to avoid:** Add to tsup config:
```typescript
banner: {
  js: `import {createRequire as __createRequire} from 'module';var require=__createRequire(import.meta.url);`
}
```
**Warning signs:** Process crashes immediately on startup with `require is not defined`.

### Pitfall 4: Drizzle `migrate()` called before WAL pragma
**What goes wrong:** Migration runs without WAL mode, then WAL is set. First few writes may be slow.
**How to avoid:** Set WAL pragma before calling `migrate()`.

### Pitfall 5: ALS context lost after `storage.run()` returns
**What goes wrong:** Calling `storage.getStore()` outside of an active `storage.run()` context returns `undefined`. Logger fails silently or throws.
**Why it happens:** ALS context is scoped to the run() call tree. Code running outside any lensFn/lensRoute has no context.
**How to avoid:** Logger must handle `undefined` store gracefully — emit log without traceId/spanId when outside context.

### Pitfall 6: MCP tool description too long
**What goes wrong:** Agent skips or misuses the tool. v1 got 0/9 adoption — this is the likely cause.
**Why it happens:** Agents parse tool lists with limited attention. Long descriptions bury the key intent.
**How to avoid:** Description = 1-2 sentences, verb-first. Put all parameter detail in Zod `.describe()`. Test with actual Claude invocations on unfamiliar repos before Phase 2.

### Pitfall 7: tsup dual build — CJS/ESM format detection
**What goes wrong:** Banner with `createRequire` is injected into CJS output too, causing `import` syntax errors.
**How to avoid:** Use format-conditional banner:
```typescript
banner(ctx) {
  if (ctx.format === 'esm') {
    return { js: `import {createRequire as __createRequire} from 'module';var require=__createRequire(import.meta.url);` }
  }
  return {}
}
```

---

## Code Examples

Verified patterns from official sources:

### Drizzle SQLite schema for traces

```typescript
// Source: https://orm.drizzle.team/docs/get-started-sqlite
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const traces = sqliteTable('traces', {
  traceId: text('trace_id').primaryKey(),
  startedAt: integer('started_at').notNull(),  // Unix ms
  endedAt: integer('ended_at'),
  durationMs: real('duration_ms'),
  rootSpanName: text('root_span_name'),
})

export const spans = sqliteTable('spans', {
  spanId: text('span_id').primaryKey(),
  traceId: text('trace_id').notNull().references(() => traces.traceId),
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
  level: text('level').notNull(),  // 'info'|'warn'|'error'|'debug'
  message: text('message').notNull(),
  timestamp: integer('timestamp').notNull(),
})
```

### Trace retention prune

```typescript
// better-sqlite3 prepared statement — synchronous, fast
const pruneStmt = sqlite.prepare(
  `DELETE FROM traces WHERE started_at < ? AND trace_id NOT IN (SELECT trace_id FROM spans WHERE ended_at IS NULL)`
)

function pruneOldTraces(retentionMs = 7 * 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - retentionMs
  pruneStmt.run(cutoff)
}

setInterval(pruneOldTraces, 60 * 60 * 1000)  // prune hourly
```

### citty CLI skeleton

```typescript
// Source: https://github.com/unjs/citty
import { defineCommand, runMain } from 'citty'

const main = defineCommand({
  meta: { name: 'lens', version: '2.0.0', description: 'LENS code query engine' },
  subCommands: {
    status: defineCommand({
      meta: { description: 'Show daemon status' },
      async run() {
        const res = await fetch('http://localhost:4111/health')
        console.log(await res.json())
      }
    })
  }
})

runMain(main)
```

### MCP tool description formula

```typescript
// FORMULA: "[verb] [noun] [key constraint if any]. Returns [what]."
// WRONG:
description: 'This tool allows you to search through code files in a repository to find relevant files based on keywords. It uses structural analysis including import graphs and co-change data to rank results.'

// RIGHT:
description: 'Query a repo by keywords. Returns ranked files with import graph context, co-change frequency, and hub scores.',
inputSchema: {
  repoPath: z.string().describe('Absolute path to the repository root'),
  query: z.string().describe('Space-separated search terms — all terms matched (AND logic)'),
  limit: z.number().optional().default(20).describe('Max results to return (default 20)'),
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `server.tool()` (MCP SDK) | `server.registerTool()` | SDK 1.x | Old signature still works but deprecated — use registerTool |
| Manual context threading (Go-style ctx param) | AsyncLocalStorage | Node 16+ stable | Zero-config DX, no param drilling |
| `drizzle-kit push` for dev | `drizzle-kit generate` + `migrate()` | 2024 | push is for dev-only; generate+migrate is production pattern |
| Biome v1 organizeImports (top-level config) | Biome v2 `assist.actions.source.organizeImports` | v2.0 2025 | v2 broke v1 organizeImports key — use `biome migrate` |
| `console.log()` for daemon logging | `process.stderr.write()` or Logger → SQLite | MCP adoption | console.log corrupts stdio JSON-RPC |

**Deprecated/outdated:**
- `server.tool()` in MCP SDK: deprecated, replaced by `server.registerTool()`. Both work in v1.x but new code must use `registerTool`.
- Biome v1 `linter.rules.organizeImports`: key moved to `assist.actions.source.organizeImports` in v2. Run `biome migrate` to update config.

---

## Open Questions

1. **lensFn() sync vs async wrapping**
   - What we know: All current engine functions will be async (file I/O, git operations).
   - What's unclear: Should `lensFn()` support synchronous functions too? Wrapping sync in async loses performance for CPU-bound ops.
   - Recommendation: Support both via overloaded signature — `lensFn(name, fn)` detects via `fn.constructor.name === 'AsyncFunction'`. Phase 1 only needs async; sync overload is forward-compat sugar.

2. **Trace schema: flat spans vs hierarchical JSON**
   - What we know: Flat spans with `parentSpanId` is standard (OpenTelemetry model); hierarchical JSON is simpler to query in SQLite.
   - What's unclear: Dashboard waterfall viewer (Phase 3) needs parent-child relationships. Flat + parentSpanId makes that SQL query trivial.
   - Recommendation: Flat spans with `parentSpanId` — matches industry standard, SQLite can reconstruct hierarchy with a CTE.

3. **Phase 1 MCP tool scope**
   - What we know: Phase 1 only has the core/daemon/MCP skeleton. Engine (indexing, scoring) comes in Phase 2.
   - What's unclear: Should Phase 1's MCP tool be a stub or should it call a minimal engine?
   - Recommendation: Phase 1 MCP tool should be real but minimal — call the daemon HTTP API which returns a placeholder response. The adoption benchmark (plan 04) needs a real tool to test against, not a stub. Benchmark: does the agent discover and call the tool on an unfamiliar repo? The response quality is Phase 2's problem.

4. **Trace batching strategy**
   - What we know: better-sqlite3 is synchronous; wrapping every span write in a transaction is the fastest pattern. Context says "batched writes from Phase 1".
   - What's unclear: Batch by count (e.g., flush every 50 spans) vs by time (flush every 100ms)?
   - Recommendation: Time-based batching (100ms flush interval) in Phase 1. Count-based adds complexity. Single `setInterval` + array buffer is sufficient for trace volume in Phase 1.

---

## Sources

### Primary (HIGH confidence)
- `https://modelcontextprotocol.io/docs/concepts/tools` — Tool protocol, registerTool API, error handling
- `https://modelcontextprotocol.io/docs/develop/build-server` — Official TypeScript MCP server tutorial, StdioServerTransport, registerTool patterns
- `https://orm.drizzle.team/docs/get-started-sqlite` — Drizzle + better-sqlite3 setup, connection, schema
- `https://orm.drizzle.team/docs/migrations` — `migrate()` programmatic usage, drizzle.config.ts
- `https://hono.dev/docs/getting-started/nodejs` — @hono/node-server serve(), graceful shutdown
- `https://hono.dev/docs/api/exception` — HTTPException, app.onError
- `https://hono.dev/docs/guides/best-practices` — Route organization, app.route() pattern
- `https://encore.dev/blog/tracing-typescripts-trails` — AsyncLocalStorage tracing pattern, how Encore.ts implements it
- `https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md` — WAL pragma, performance recommendations
- npm registry (live queries): `@modelcontextprotocol/sdk@1.26.0`, `drizzle-orm@0.45.1`, `drizzle-kit@0.31.9`, `hono@4.11.10`, `better-sqlite3@12.6.2`, `@hono/node-server@1.19.9`, `citty@0.2.1`

### Secondary (MEDIUM confidence)
- `https://steipete.me/posts/2025/mcp-best-practices` — MCP tool adoption, description best practices, verified against MCP spec
- `https://www.merge.dev/blog/mcp-tool-description` — Tool description formula (verb+noun), front-loading, verified against MCP docs
- `https://biomejs.dev/blog/biome-v2/` — Biome v2 organizeImports changes (assist system), breaking config changes
- `https://github.com/egoist/tsup/discussions/505` — createRequire banner pattern for ESM native addons
- `https://github.com/unjs/citty` — citty defineCommand, runMain, subCommands

### Tertiary (LOW confidence — flagged for validation)
- tsup maintenance concern (README recommends tsdown): Not a blocking issue; tsup 8.5.x works. Monitor for v2 release of tsdown before Phase 3.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against npm registry live queries on 2026-02-19
- Architecture: HIGH — ALS pattern verified against Encore.ts blog + Node.js docs; Drizzle setup verified against official docs
- MCP tool design: HIGH — verified against official MCP spec + modelcontextprotocol.io docs (spec version 2025-11-25 / protocol 2025-06-18)
- Pitfalls: HIGH for stdout/WAL/banner (reproducible, documented); MEDIUM for tool description adoption (empirical, v1 data)

**Research date:** 2026-02-19
**Valid until:** 2026-03-20 (stable stack — 30 days; MCP SDK moves fast, re-verify if > 2 minor versions behind)
