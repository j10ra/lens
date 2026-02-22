#### rlm-exp-01
- **Category**: Exploratory
- **Prompt**:
  `Explain the request flow when the MCP server receives a lens_grep tool call. How does it reach the scoring engine and what gets traced?`
- **Judge Criteria**:
  1. MCP tools call daemon HTTP routes at `http://localhost:4111/api/mcp/grep` (defined in `apps/daemon/src/mcp.ts` line 7)
  2. The grep route is wrapped with `lensRoute("grep.post", ...)` in `apps/daemon/src/routes/grep.ts`
  3. `grepRepo()` from `@lens/engine` performs TF-IDF scoring via `interpretQuery()` in `packages/engine/src/grep/scorer.ts`
  4. Traces are persisted via `TraceStore.pushSpan()` to SQLite, with spans linked to traces via `traceId`

#### rlm-exp-02
- **Category**: Exploratory
- **Prompt**:
  `How does the tracing system work? Explain the relationship between lensFn, lensRoute, TraceStore, and AsyncLocalStorage.`
- **Judge Criteria**:
  1. `AsyncLocalStorage` from `node:async_hooks` provides context propagation (defined in `packages/core/src/context.ts` line 15)
  2. `lensFn()` wraps engine functions and creates child spans with `parentSpanId` linkage (`packages/core/src/lens-fn.ts` lines 43-52)
  3. `lensRoute()` creates root spans for HTTP handlers with source tracking via `x-lens-source` header (`packages/core/src/lens-route.ts` line 37)
  4. `TraceStore` batches spans in a buffer and flushes every 100ms (`packages/core/src/trace-store.ts` line 64)
  5. `configureLensFn()` and `configureLensRoute()` inject the shared `TraceStore` singleton at startup

#### rlm-exp-03
- **Category**: Exploratory
- **Prompt**:
  `Describe how the indexing engine discovers files, extracts metadata, and builds the import graph. What is the incremental indexing strategy?`
- **Judge Criteria**:
  1. `fullScan()` and `diffScan()` in `packages/engine/src/index/discovery.ts` handle file discovery
  2. `extractAndPersistMetadata()` parses files and stores exports, imports, docstrings, symbols in `fileMetadata` table
  3. `buildAndPersistImportGraph()` resolves imports using language-specific parsers and stores edges in `fileImports` table
  4. Incremental indexing skips if `last_indexed_commit` matches current HEAD and no symbol backfill needed (`packages/engine/src/index/engine.ts` lines 51-54)
  5. In-memory mutex via `withLock()` prevents concurrent indexing of the same repo (lines 15-28)

#### rlm-dbg-01
- **Category**: Debug
- **Prompt**:
  `A user reports that grep results are missing the `isHub` flag even for heavily-imported files. Where is hub detection calculated and what could cause it to fail?`
- **Judge Criteria**:
  1. `isHub` is set when `indegree >= HUB_THRESHOLD` (constant is 5 in `packages/engine/src/grep/scorer.ts` line 8)
  2. `getIndegrees()` from `packages/engine/src/grep/structural.ts` counts reverse imports per file
  3. If `buildAndPersistImportGraph()` hasn't run, `fileImports` table is empty → `indegrees` map is empty → `isHub` always false
  4. Import graph requires `fileMetadata.imports` to be populated with parsed import specifiers
  5. Parser must resolve relative imports via `resolveImport()` in `packages/engine/src/parsers/typescript/resolve.ts`

#### rlm-dbg-02
- **Category**: Debug
- **Prompt**:
  `The daemon logs show trace spans but the dashboard waterfall view shows no traces. Trace the data flow from span creation to dashboard query.`
- **Judge Criteria**:
  1. `TraceStore.pushSpan()` buffers spans in `spanBuffer` array (`packages/core/src/trace-store.ts` line 70)
  2. `flush()` runs every 100ms via `setInterval` and writes to SQLite tables `traces` and `spans` (lines 77-152)
  3. Dashboard queries `/api/dashboard/traces` route which calls `queryTraces()` and `querySpans()` methods
  4. If daemon was killed before `flush()` ran, buffered spans are lost (only `close()` ensures final flush)
  5. Dashboard fetches from `http://localhost:4111` with `/api/dashboard/` prefix (defined in `apps/daemon/src/http.ts` line 71)

#### rlm-dbg-03
- **Category**: Debug
- **Prompt**:
  `MCP tool calls fail with "Session expired" error after the daemon restarts. Explain the session management and why this happens.`
- **Judge Criteria**:
  1. Sessions are stored in an in-memory `Map<string, { transport, server }>` in `apps/daemon/src/mcp.ts` line 10
  2. Each new client creates a fresh `McpServer` instance with `createSession()` (lines 132-145)
  3. On daemon restart, the `sessions` Map is empty, so existing session IDs are not found (line 152-153)
  4. Missing session returns 404 with error code -32000 "Session expired" (line 155)
  5. Client must reinitialize by calling `/mcp` without a session header to get a new session

#### rlm-chg-01
- **Category**: Change-Impact
- **Prompt**:
  `We want to add a new field `complexity_score` to file metadata. List all files that would need to be modified.`
- **Judge Criteria**:
  1. `packages/engine/src/db/schema.ts` — add column to `fileMetadata` table definition
  2. `packages/engine/src/index/extract-metadata.ts` — compute and store the new field
  3. `packages/engine/src/db/queries.ts` — add query methods if needed for retrieval
  4. `packages/engine/src/grep/scorer.ts` — potentially use in scoring algorithm
  5. New migration file in `packages/engine/drizzle/` for SQLite schema change

#### rlm-chg-02
- **Category**: Change-Impact
- **Prompt**:
  `If we added Python language support, what files would need changes? Map the parser extension points.`
- **Judge Criteria**:
  1. Create new directory `packages/engine/src/parsers/python/` with `index.ts` and `resolve.ts`
  2. New parser must implement `LanguageParser` interface from `packages/engine/src/parsers/types.ts`
  3. Register parser via `registerParser()` in `packages/engine/src/parsers/registry.ts` line 18
  4. Implement `parseImports()`, `parseExports()`, `parseSymbols()` methods matching TypeScript parser
  5. Handle Python-specific import resolution (no `.js` stripping, handle `from X import Y` syntax)

#### rlm-chg-03
- **Category**: Change-Impact
- **Prompt**:
  `We want to support filtering traces by error status in the dashboard. What backend and frontend changes are required?`
- **Judge Criteria**:
  1. `packages/core/src/trace-store.ts` — modify `queryTraces()` to accept error filter parameter
  2. Add SQL `WHERE error_message IS NOT NULL` or `WHERE error_message IS NULL` clause
  3. `apps/daemon/src/routes/traces.ts` — expose filter param via query string
  4. `apps/dashboard/src/pages/Traces.tsx` — add UI filter control (toggle or dropdown)
  5. `apps/dashboard/src/components/TraceWaterfall.tsx` — potentially highlight error traces visually

#### rlm-tgt-01
- **Category**: Targeted
- **Prompt**:
  `Find where the daemon port is defined and how it can be configured.`
- **Judge Criteria**:
  1. Port is hardcoded as `const PORT = 4111` in `apps/daemon/src/http.ts` line 96
  2. No environment variable override exists in current implementation
  3. Server started via `serve({ fetch: app.fetch, port: PORT }, ...)` on line 98
  4. CLI health check also hardcodes port in `packages/cli/src/commands/daemon.ts` line 103
  5. MCP tools hardcode `http://localhost:4111` in `apps/daemon/src/mcp.ts` line 7

#### rlm-tgt-02
- **Category**: Targeted
- **Prompt**:
  `Find the TF-IDF field weights used in search scoring and the hub threshold constant.`
- **Judge Criteria**:
  1. `FIELD_WEIGHTS` object in `packages/engine/src/grep/scorer.ts` lines 11-19
  2. Weights: `fileName: 4`, `dirPath: 2`, `exports: 2.5`, `docstring: 1`, `sections: 1`, `internals: 1.5`, `symbols: 3`
  3. `HUB_THRESHOLD = 5` defined on line 8 of same file
  4. IDF calculation clamped to range [1, 10] via `Math.min(10, Math.max(1, Math.log(N / docFreq)))` line 115
  5. Hub dampening applies when exports.length > 5 (line 173)

#### rlm-tgt-03
- **Category**: Targeted
- **Prompt**:
  `Find where the daemon stores its data files (traces DB, index DB, PID file, logs).`
- **Judge Criteria**:
  1. `DATA_DIR` defaults to `~/.lens` via `join(homedir(), ".lens")` in `apps/daemon/src/index.ts` line 8
  2. `TRACE_DB` at `join(DATA_DIR, "traces.db")` for TraceStore SQLite (line 9)
  3. `INDEX_DB` at `join(DATA_DIR, "index.db")` for engine SQLite (line 10)
  4. CLI uses same `DATA_DIR` with `PID_FILE = join(DATA_DIR, "daemon.pid")` in `packages/cli/src/commands/daemon.ts` line 10
  5. `LOG_FILE = join(DATA_DIR, "daemon.log")` for daemon output (line 11)
  6. `LENS_DATA_DIR` env var can override default location (`process.env.LENS_DATA_DIR` in daemon/index.ts line 8)
