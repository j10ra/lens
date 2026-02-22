Now I have the complete picture. Here's the request flow:

## MCP lens_grep Request Flow

### 1. MCP Tool Registration (mcp.ts:12-45)
When the MCP server starts, it registers the `lens_grep` tool with the MCP SDK. The handler:
```typescript
async ({ repoPath, query, limit }) => {
  const res = await fetch(`${API}/grep`, { ... });
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}
```
**Key insight**: MCP doesn't call engine directly — it HTTP POSTs to `localhost:4111/api/mcp/grep`.

### 2. HTTP Route Layer (routes/grep.ts:7-32)
The `/grep` route is wrapped in `lensRoute()`:
```typescript
grepRoutes.post("/", lensRoute("grep.post", async (c) => {
  const { repoPath, query, limit } = await c.req.json();
  const db = getEngineDb();
  const repos = await listRepos(db);
  const repo = repos.find(r => r.root_path === repoPath);
  await ensureIndex(db, repo.id);
  const result = await grepRepo(db, repo.id, query, limit);
  return c.json(result);
}));
```

### 3. lensRoute Tracing (lens-route.ts:29-108)
`lensRoute()` creates the **root span** for the request:
- Generates `spanId`, `traceId`, start timestamp
- Creates `TraceContext` with a `spanStack`
- Runs handler inside `storage.run(ctx, ...)` — Node's `AsyncLocalStorage`
- Captures input/output JSON (up to 256KB)
- On completion/error: calls `_store.pushSpan()` to buffer the trace

### 4. Engine Function Layer (engine/index.ts:40)
```typescript
export const grepRepo = lensFn("engine.grepRepo", grepRepoImpl);
```
`grepRepo` is wrapped in `lensFn()` — this creates a **child span**.

### 5. lensFn Nested Tracing (lens-fn.ts:37-90)
`lensFn()` detects parent context via `storage.getStore()`:
- Inherits `traceId` from parent (same trace)
- Creates new `spanId` with `parentSpanId` linking to parent span
- Pushes to parent's `spanStack`
- On completion: calls `_store.pushSpan()` with nested span data

### 6. Scoring Engine (grep/scorer.ts:66-202)
`grepRepoImpl` calls `interpretQuery()` (synchronous, not wrapped separately):
- Loads all file metadata from SQLite
- Computes IDF per term: `log(N / documentFrequency)`
- Scores each file using field weights:
  - `fileName: 4`, `symbols: 3`, `exports: 2.5`, `dirPath: 2`
- Applies structural boosters:
  - Hotness (recent commits)
  - Indegree boost (imported files rank higher)
  - Hub dampening (files with >5 exports get penalized)
  - Multi-term coverage bonus
- Returns top `limit` files sorted by score

### 7. Enrichment (grep/grep.ts:52-123)
`grepRepoImpl` then enriches scored files:
- `getReverseImports()` — who imports this file
- `getCochangePartners()` — git co-change history
- Exports, docstrings, structural matches per term

### 8. Trace Persistence (trace-store.ts:38-153)
All spans are **batched**:
- `pushSpan()` adds to in-memory buffer
- Every 100ms: `flush()` writes batched spans to SQLite
- WAL mode for concurrent read performance
- Retention: 7 days default

## What Gets Traced

| Layer | Span Name | Parent | Tracked |
|-------|-----------|--------|---------|
| HTTP route | `grep.post` | root | input/output JSON, source (mcp), duration |
| Engine | `engine.grepRepo` | `grep.post` | args (db handle dropped), result, duration |
| Engine | `engine.listRepos` | `grep.post` | (nested) |
| Engine | `engine.ensureIndex` | `grep.post` | (nested) |

The trace hierarchy in SQLite:
```
traces (trace_id, root_span_name, source, duration_ms)
  └── spans (span_id, parent_span_id, name, input, output, duration_ms)
```

## Report

- **Tool calls**: 7
- **Tools used**: ToolSearch, Grep, Read
- **Files read**: 7
- **Files used**: apps/daemon/src/mcp.ts, apps/daemon/src/routes/grep.ts, packages/core/src/lens-route.ts, packages/core/src/lens-fn.ts, packages/core/src/context.ts, packages/core/src/trace-store.ts, packages/engine/src/index.ts, packages/engine/src/grep/grep.ts, packages/engine/src/grep/scorer.ts
- **Key findings**:
  - MCP → HTTP → Engine flow enforced; no in-process shortcuts
  - `lensRoute` creates root spans; `lensFn` creates nested child spans linked via `parentSpanId`
  - AsyncLocalStorage propagates trace context automatically across async boundaries
  - Traces batched every 100ms to SQLite (WAL mode) — not per-request writes
  - Scoring is TF-IDF with structural boosters (hotness, indegree, hub dampening, multi-term coverage)
