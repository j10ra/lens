Now I have the complete picture. Here's the request flow for `lens_grep`:

---

## Request Flow: MCP → Scoring Engine → TraceStore

### 1. MCP Tool Handler (`apps/daemon/src/mcp.ts:36-44`)
```
MCP Client → lens_grep tool → fetch("http://localhost:4111/api/mcp/grep")
```
The MCP server registers `lens_grep` with `server.registerTool()`. When invoked, the handler makes an HTTP POST to the daemon's `/api/mcp/grep` endpoint. **No direct engine calls** — MCP is a gate, routing through HTTP.

### 2. HTTP Route with lensRoute (`apps/daemon/src/routes/grep.ts:7-31`)
```typescript
grepRoutes.post("/", lensRoute("grep.post", async (c) => { ... }))
```
The route handler is wrapped in `lensRoute()`, which:
- Creates a **root span** with unique `traceId` and `spanId`
- Stores context in `AsyncLocalStorage` (`storage.run(ctx, ...)`)
- Captures input/output JSON (capped at 256KB)
- Records timing (start, duration)
- Pushes span to `TraceStore` on success or error

### 3. Engine Call with lensFn (`packages/engine/src/index.ts:40`)
```typescript
export const grepRepo = lensFn("engine.grepRepo", grepRepoImpl);
```
Inside the route, `grepRepo()` is called. This function is wrapped in `lensFn()`, which:
- Detects parent context via `storage.getStore()`
- Creates a **child span** linked via `parentSpanId`
- Inherits the same `traceId` for correlation
- Records nested timing and args

### 4. Scoring Algorithm (`packages/engine/src/grep/scorer.ts:66-201`)
`interpretQuery()` executes the TF-IDF scoring:
1. Load all file metadata for repo
2. Compute per-term IDF: `min(10, max(1, log(N / df)))`
3. Score each file across weighted fields (fileName=4, symbols=3, exports=2.5, etc.)
4. Apply structural boosters: hotness (recent commits), indegree, hub dampening, multi-term coverage
5. Return top `limit` files sorted by score

### 5. Enrichment (`packages/engine/src/grep/grep.ts:52-123`)
`grepRepoImpl()` enriches scored files with:
- **Importers**: reverse import graph (who imports this file)
- **Co-change partners**: files that change together in git history
- **Structural matches**: where each term matched (symbol, export, file, docstring, etc.)

### 6. Trace Persistence (`packages/core/src/trace-store.ts`)
All spans flow to `TraceStore.pushSpan()`:
- Buffered in memory
- Batched writes to SQLite (WAL mode)
- 7-day retention by default
- Powers dashboard trace waterfall view

---

## What Gets Traced

| Layer | Span Name | Parent | Captured |
|-------|-----------|--------|----------|
| Route | `grep.post` | none (root) | `{repoPath, query, limit}` input, JSON response output, source header |
| Engine | `engine.grepRepo` | `grep.post` | `[db, repoId, query, limit]` args (db handle dropped), result |

Both spans share the same `traceId`, enabling hierarchical visualization in the dashboard.

---

## Architecture Constraint Enforced

```
MCP ──fetch──▶ HTTP Route ──call──▶ Engine ──query──▶ SQLite
                  │                    │
             lensRoute()          lensFn()
                  │                    │
                  └────▶ TraceStore ◀──┘
```

**No shortcuts** — MCP never calls engine directly. Every request flows through HTTP, ensuring unified tracing regardless of entry point (CLI, MCP, or dashboard).

---

## Report

- **Tool calls**: 7
- **Tools used**: ToolSearch, Read, Grep
- **Files read**: 6
- **Files used**: `apps/daemon/src/mcp.ts`, `apps/daemon/src/routes/grep.ts`, `packages/core/src/lens-route.ts`, `packages/core/src/lens-fn.ts`, `packages/core/src/context.ts`, `packages/engine/src/grep/grep.ts`, `packages/engine/src/grep/scorer.ts`, `packages/engine/src/index.ts`, `packages/core/src/trace-store.ts`
- **Key findings**:
  - MCP is a pure HTTP gateway — `fetch(:4111/api/mcp/grep)` — never calls engine directly
  - `lensRoute` creates root spans with `AsyncLocalStorage` context propagation
  - `lensFn` creates child spans linked via `parentSpanId`, inheriting `traceId`
  - Scoring is TF-IDF over metadata fields with structural boosters (indegree, hotness, hub dampening)
  - All spans batch to SQLite TraceStore for dashboard visualization
