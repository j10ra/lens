# Architecture Research

**Domain:** Local-first structured code query engine with observability
**Researched:** 2026-02-19
**Confidence:** HIGH (existing v1 implementation + established patterns)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Consumer Layer                              │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │   CLI    │  │  Dashboard   │  │  MCP Client  │                  │
│  │  (thin)  │  │  (React SPA) │  │ (Claude/etc) │                  │
│  └────┬─────┘  └──────┬───────┘  └──────┬───────┘                  │
│       │  HTTP          │  HTTP           │  stdio                   │
├───────┴────────────────┴─────────────────┴──────────────────────────┤
│                         Gateway Layer                               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Daemon (Hono :4111)                        │   │
│  │   lensRoute() wraps every handler → auto request tracing     │   │
│  │   ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐     │   │
│  │   │ /api/*  │  │ /mcp    │  │ /dash/*  │  │ /health  │     │   │
│  │   └────┬────┘  └────┬────┘  └────┬─────┘  └──────────┘     │   │
│  └────────┼─────────────┼───────────┼──────────────────────────┘   │
├───────────┴─────────────┴───────────┴──────────────────────────────┤
│                        Intelligence Layer                           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Engine (@lens/engine)                      │   │
│  │   lensFn() wraps every function → auto span tracing          │   │
│  │                                                              │   │
│  │   ┌────────────┐  ┌────────────┐  ┌───────────────┐         │   │
│  │   │  Indexing   │  │  Scoring   │  │  Query Build  │         │   │
│  │   │  Pipeline   │  │  Engine    │  │  (context)    │         │   │
│  │   └──────┬─────┘  └──────┬─────┘  └───────┬───────┘         │   │
│  │          │               │                │                  │   │
│  │   ┌──────┴─────┐  ┌─────┴──────┐  ┌──────┴───────┐          │   │
│  │   │ Discovery  │  │ Import     │  │ Co-change    │          │   │
│  │   │ Chunker    │  │ Graph      │  │ Analysis     │          │   │
│  │   │ Metadata   │  │ Hub Det.   │  │ Git History  │          │   │
│  │   └────────────┘  └────────────┘  └──────────────┘          │   │
│  └──────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                        Foundation Layer                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Core (@lens/core)                          │   │
│  │                                                              │   │
│  │   ┌──────────┐  ┌────────────┐  ┌────────┐  ┌────────────┐  │   │
│  │   │ lensFn() │  │lensRoute() │  │ Logger │  │ TraceStore │  │   │
│  │   └──────────┘  └────────────┘  └────────┘  └─────┬──────┘  │   │
│  └────────────────────────────────────────────────────┼─────────┘   │
├───────────────────────────────────────────────────────┼─────────────┤
│                        Storage Layer                   │             │
│  ┌────────────────────────────────────────────────────┼─────────┐   │
│  │                  SQLite (better-sqlite3)            │         │   │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────┴────┐   │   │
│  │   │  repos   │  │  chunks  │  │  graphs  │  │  traces  │   │   │
│  │   └──────────┘  └──────────┘  └──────────┘  └──────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| **@lens/core** | Framework primitives: `lensFn()`, `lensRoute()`, Logger, TraceStore. Zero business logic. | SQLite (trace writes), consumed by engine + daemon |
| **@lens/engine** | All code intelligence: indexing, scoring, graphs, co-change, hubs. Every exported fn wrapped in `lensFn()`. | core (tracing), SQLite (data read/write) |
| **@lens/daemon** | HTTP gateway (Hono :4111). MCP stdio server. Static file server for dashboard. All routes via `lensRoute()`. | engine (calls intelligence fns), core (tracing) |
| **@lens/dashboard** | Vite + React SPA. Trace waterfall, repo explorer, graph viz. | daemon (HTTP API only) |
| **@lens/cli** | Thin argument parser. No logic. | daemon (HTTP API only) |

### Key Boundary Rules

1. **Engine has no HTTP knowledge** — receives structured args, returns structured results
2. **Daemon has no intelligence logic** — delegates all computation to engine
3. **Core has no business logic** — purely infrastructure (tracing, logging, storage)
4. **Dashboard and CLI only talk to daemon HTTP API** — never import engine or core directly
5. **All engine functions observable** — `lensFn()` wrapping is structural, not optional

## Recommended Project Structure

```
packages/
├── core/                  # Framework primitives
│   ├── src/
│   │   ├── lens-fn.ts     # lensFn() — function wrapper with auto-tracing
│   │   ├── lens-route.ts  # lensRoute() — Hono route wrapper
│   │   ├── logger.ts      # Structured Logger (replaces console.log)
│   │   ├── trace-store.ts # TraceStore — SQLite persistence via Drizzle
│   │   ├── schema.ts      # Drizzle schema for traces/spans
│   │   ├── types.ts       # Shared types (TraceSpan, LogLevel, etc.)
│   │   └── index.ts       # Public API barrel
│   ├── package.json
│   └── tsup.config.ts
│
├── engine/                # Code intelligence
│   ├── src/
│   │   ├── db/
│   │   │   ├── connection.ts  # better-sqlite3 + Drizzle setup
│   │   │   ├── schema.ts      # repos, chunks, file_metadata, imports, cochanges
│   │   │   └── queries.ts     # Typed query helpers per table
│   │   ├── index/             # Indexing pipeline
│   │   │   ├── engine.ts      # Orchestrates full/diff indexing
│   │   │   ├── discovery.ts   # File discovery (full scan, diff scan)
│   │   │   ├── chunker.ts     # File → chunks with hash dedup
│   │   │   ├── metadata.ts    # Extract exports, imports, docstrings
│   │   │   ├── imports.ts     # Import specifier resolution
│   │   │   └── git-analysis.ts # Git log → commit stats, co-change pairs
│   │   ├── graph/             # Graph queries
│   │   │   ├── import-graph.ts # Build + query import edges
│   │   │   ├── co-change.ts    # Co-change partner queries
│   │   │   └── hubs.ts         # Hub detection (high-indegree files)
│   │   ├── scoring/           # File ranking
│   │   │   ├── tf-idf.ts      # Term frequency scoring
│   │   │   ├── composite.ts   # Combine signals into final score
│   │   │   └── interpreter.ts # Query → scored file list
│   │   ├── context/           # Context building (unified output)
│   │   │   ├── builder.ts     # Orchestrates query → context response
│   │   │   └── formatter.ts   # Context data → formatted output
│   │   ├── repo/              # Repository management
│   │   │   ├── repo.ts        # register, remove, list, status
│   │   │   └── identity.ts    # Repo identity key derivation
│   │   ├── types.ts           # Engine-specific types
│   │   └── index.ts           # Public API barrel
│   ├── package.json
│   └── tsup.config.ts
│
└── cli/                   # Thin CLI shell
    ├── src/
    │   ├── commands/      # One file per command
    │   └── index.ts       # Entry point, arg parsing
    ├── package.json
    └── tsup.config.ts

apps/
├── daemon/                # HTTP + MCP gateway
│   ├── src/
│   │   ├── routes/        # Hono route modules (all use lensRoute)
│   │   │   ├── api.ts     # /api/* — engine endpoints
│   │   │   ├── mcp.ts     # MCP stdio server setup
│   │   │   └── dashboard.ts # Static file serving
│   │   ├── server.ts      # Hono app assembly, middleware
│   │   └── index.ts       # Entry point (start server)
│   ├── package.json
│   └── tsup.config.ts
│
└── dashboard/             # React SPA
    ├── src/
    │   ├── components/    # shadcn/ui based
    │   ├── pages/         # Route-level views
    │   ├── lib/           # API client, utils
    │   ├── stores/        # TanStack Store micro-stores
    │   └── main.tsx       # Entry point
    ├── index.html
    ├── package.json
    └── vite.config.ts
```

### Structure Rationale

- **core/ is flat** — only 4-5 primitives, no sub-nesting needed. Keeps the foundation obvious and auditable.
- **engine/src/ has domain folders** — index/, graph/, scoring/, context/ map to distinct concerns. Each folder owns one phase of the pipeline.
- **engine/db/ is separate from core/schema** — engine owns code intelligence data (repos, chunks, imports), core owns observability data (traces, spans). Two schemas, one SQLite file.
- **daemon/routes/ mirrors API surface** — one file per route namespace. Easy to find, easy to add.
- **dashboard/stores/ uses TanStack Store** — micro-stores per concern, not a global store. Components subscribe to exactly what they need.

## Architectural Patterns

### Pattern 1: lensFn() — Automatic Function Instrumentation

**What:** Wraps every engine function in an observable shell that captures timing, inputs summary, outputs summary, and errors. Inspired by Encore.ts's compile-time instrumentation, but runtime-based.
**When to use:** Every exported function in `@lens/engine`. Non-negotiable.
**Trade-offs:** ~microsecond overhead per call (negligible vs I/O). Adds one level of indirection. Worth it for complete observability.

```typescript
// core/src/lens-fn.ts
export function lensFn<T extends (...args: any[]) => any>(
  name: string,
  fn: T,
  opts?: { module?: string }
): T {
  const wrapped = ((...args: Parameters<T>) => {
    const span = TraceStore.startSpan(name, opts?.module);
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        return result
          .then(v => { span.end(); return v; })
          .catch(e => { span.error(e); throw e; });
      }
      span.end();
      return result;
    } catch (e) {
      span.error(e as Error);
      throw e;
    }
  }) as T;
  return wrapped;
}

// engine/src/graph/import-graph.ts — usage
export const buildImportGraph = lensFn(
  "buildImportGraph",
  (db: Db, repoId: string): number => {
    // actual logic here
  },
  { module: "graph" }
);
```

### Pattern 2: lensRoute() — Request-Level Tracing

**What:** Wraps Hono route handlers to create a request-scoped trace that captures method, path, status, duration, and links to child spans from engine calls.
**When to use:** Every route in the daemon. Non-negotiable.
**Trade-offs:** Creates trace context per request. SQLite write on completion. Acceptable for a local daemon.

```typescript
// core/src/lens-route.ts
export function lensRoute<E extends Env>(
  handler: (c: Context<E>) => Response | Promise<Response>
): (c: Context<E>) => Response | Promise<Response> {
  return async (c) => {
    const traceId = TraceStore.startTrace(c.req.method, c.req.path);
    try {
      const res = await handler(c);
      TraceStore.endTrace(traceId, res.status);
      return res;
    } catch (e) {
      TraceStore.endTrace(traceId, 500, e as Error);
      throw e;
    }
  };
}
```

### Pattern 3: Pipeline Architecture for Indexing

**What:** Indexing runs as a sequential pipeline: discover → chunk → extract metadata → build import graph → analyze git history. Each stage is a `lensFn()` that reads from and writes to SQLite.
**When to use:** All indexing operations. Pipeline stages are independently testable and observable.
**Trade-offs:** Sequential is simpler but slower than parallel. For local repos (< 50K files), sequential is fast enough. Parallelism can be added per-stage later without changing the pipeline shape.

```
discover(repoPath)
    → files[]
        → chunk(file) per file
            → extractMetadata(file) per file
                → buildImportGraph(repo)
                    → analyzeGitHistory(repo)
                        → done (repo.index_status = "ready")
```

### Pattern 4: Unified Output Model

**What:** One query produces a `ContextResponse` object. The daemon serializes it as JSON for MCP/API consumers. The dashboard renders it visually. Same data, two views.
**When to use:** Every context query. The engine never formats for a specific consumer.
**Trade-offs:** Engine returns more data than any single consumer needs. This is fine — consumers pick what they display.

## Data Flow

### Query Flow (Primary Path)

```
Consumer (CLI/MCP/Dashboard)
    ↓  HTTP request / MCP tool call
Daemon (lensRoute)
    ↓  Parse request, create trace context
Engine: buildContext()
    ├── ensureIndexed()  → check if index is fresh, re-index if stale
    ├── interpretQuery()  → parse goal → scored file list
    │   ├── TF-IDF scoring against chunks
    │   ├── Import graph: hub bonus, reverse deps
    │   └── Co-change: frequently changed together bonus
    ├── resolveSnippets() → locate exact code ranges
    ├── loadGraphContext() → import chains, co-change partners
    └── formatContext()   → assemble ContextResponse
    ↓
Daemon: serialize JSON response + persist trace
    ↓
Consumer: render (CLI prints, dashboard visualizes, MCP returns to agent)
```

### Indexing Flow

```
Trigger: repo register / manual reindex / file watcher
    ↓
discovery: git diff or full scan → file list
    ↓
chunking: file → chunks (hash-based dedup)
    ↓
metadata: AST-light extraction (exports, imports, docstrings)
    ↓
import graph: resolve import specifiers → edges table
    ↓
git analysis: git log → commit counts, co-change pairs
    ↓
repo.index_status = "ready", repo.last_indexed_commit = HEAD
```

### Trace Flow (Observability)

```
Request arrives at daemon
    ↓ lensRoute creates trace
Engine functions called
    ↓ lensFn creates child spans (auto-linked to active trace)
All spans complete
    ↓ TraceStore.endTrace writes to SQLite
Dashboard polls /api/traces
    ↓ renders waterfall visualization
```

### Key Data Flows

1. **Query → Context:** Consumer sends natural language goal → engine scores files using TF-IDF + graph signals → returns ranked files with structural context (importers, co-change partners, hub status).
2. **Index → Storage:** File system scan → chunk + hash → metadata extraction → graph construction → all persisted to SQLite tables (chunks, file_metadata, file_imports, file_stats, file_cochanges).
3. **Trace → Dashboard:** Every `lensFn` and `lensRoute` call writes spans → TraceStore persists to SQLite → dashboard reads via daemon API → renders waterfall.

## Build Order (Dependency Chain)

The workspace dependency graph dictates build order. Getting this wrong means broken imports at compile time.

```
Phase 1: @lens/core         ← no internal deps, build first
    ↓
Phase 2: @lens/engine       ← depends on core (lensFn, Logger, types)
    ↓
Phase 3: @lens/daemon       ← depends on core (lensRoute) + engine (intelligence fns)
         @lens/cli          ← depends on nothing internal (HTTP calls only)
         @lens/dashboard    ← depends on nothing internal (HTTP calls only)
```

### Detailed Build Dependencies

| Package | Depends On | Must Build After |
|---------|-----------|-----------------|
| @lens/core | (none internal) | — |
| @lens/engine | @lens/core | core |
| @lens/daemon | @lens/core, @lens/engine | core, engine |
| @lens/cli | (none — HTTP only) | daemon must be running, not built |
| @lens/dashboard | (none — HTTP only) | daemon must be running, not built |

### Implementation Build Order

Within each package, internal modules have ordering too:

**Core (Phase 1):**
1. `types.ts` — TraceSpan, LogLevel, shared interfaces
2. `logger.ts` — structured logger (other modules use it)
3. `schema.ts` — Drizzle schema for traces table
4. `trace-store.ts` — depends on schema + logger
5. `lens-fn.ts` — depends on trace-store
6. `lens-route.ts` — depends on trace-store
7. `index.ts` — barrel export

**Engine (Phase 2):**
1. `types.ts` — engine-specific types
2. `db/schema.ts` — Drizzle schema (repos, chunks, metadata, imports, cochanges)
3. `db/connection.ts` — better-sqlite3 + Drizzle init
4. `db/queries.ts` — typed query helpers
5. `repo/` — register, list, status (CRUD)
6. `index/discovery.ts` → `index/chunker.ts` → `index/metadata.ts` → `index/imports.ts`
7. `index/git-analysis.ts` — git log parsing
8. `index/engine.ts` — orchestrates pipeline
9. `graph/import-graph.ts` → `graph/co-change.ts` → `graph/hubs.ts`
10. `scoring/tf-idf.ts` → `scoring/composite.ts` → `scoring/interpreter.ts`
11. `context/builder.ts` → `context/formatter.ts`
12. `index.ts` — barrel export

**Daemon (Phase 3):**
1. `server.ts` — Hono app setup, middleware
2. `routes/api.ts` — engine API routes
3. `routes/mcp.ts` — MCP stdio server
4. `routes/dashboard.ts` — static file serving
5. `index.ts` — entry point

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-5 repos, < 10K files each | Current design. Single SQLite. Sub-second queries. |
| 10-50 repos, < 50K files each | SQLite WAL mode. Index in background worker thread. Query cache with TTL. |
| 50+ repos or 100K+ files | Per-repo SQLite databases (one file per repo). Worker pool for indexing. Consider read replicas. |

### Scaling Priorities

1. **First bottleneck: indexing speed** — Git analysis and metadata extraction on large repos (> 20K files). Fix: incremental diff-only indexing (already in v1 design), worker thread isolation.
2. **Second bottleneck: query latency on large graphs** — Import graph traversal + co-change lookups for repos with 50K+ edges. Fix: precompute hub scores and indegree counts at index time, cache hot queries.

## Anti-Patterns

### Anti-Pattern 1: Naked Exports

**What people do:** Export engine functions without `lensFn()` wrapping.
**Why it's wrong:** Breaks the observability contract. Dashboard trace waterfall shows gaps. Debug experience degrades silently.
**Do this instead:** Every exported function in engine goes through `lensFn()`. Lint rule or barrel-export convention to enforce.

### Anti-Pattern 2: Engine Knows About HTTP

**What people do:** Import Hono types or check request headers inside engine functions.
**Why it's wrong:** Engine becomes untestable without an HTTP context. Couples intelligence logic to transport.
**Do this instead:** Engine receives plain TypeScript args (strings, objects). Daemon translates HTTP requests to engine calls.

### Anti-Pattern 3: Dashboard Imports Engine

**What people do:** Import engine types or functions directly into dashboard code.
**Why it's wrong:** Dashboard is a separate Vite build. Engine uses Node.js APIs (fs, child_process, better-sqlite3). Import fails in browser.
**Do this instead:** Dashboard talks to daemon HTTP API only. Define API response types in dashboard code, or share a thin types-only package.

### Anti-Pattern 4: Global Mutable State in Engine

**What people do:** Module-level caches, singletons, shared Maps.
**Why it's wrong:** Race conditions with concurrent requests. Hidden coupling between tests. Memory leaks on long-running daemon.
**Do this instead:** Pass `db` handle explicitly. Use request-scoped caches (TTL-bounded). v1 had a query cache — keep it bounded and evictable.

### Anti-Pattern 5: Fat CLI

**What people do:** Put logic in the CLI package (indexing, scoring, formatting).
**Why it's wrong:** Duplicates daemon functionality. CLI and MCP diverge in behavior. Two things to maintain.
**Do this instead:** CLI is a thin HTTP client. `lens context "goal"` → `POST http://localhost:4111/api/context`. Period.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| MCP (Claude Code, Cursor) | stdio transport via `@modelcontextprotocol/sdk` | Daemon spawns MCP server on demand. Tools: `get_context`, `list_repos`, `repo_status`. |
| Git | `child_process.exec` for git log, diff, rev-parse | Engine calls git CLI directly. No libgit2 dependency. |
| File system | Node.js `fs` API | Engine reads files for chunking/metadata. Daemon serves static dashboard files. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| core ↔ engine | Direct import (`import { lensFn } from "@lens/core"`) | Engine wraps all fns. Core provides trace context. |
| core ↔ daemon | Direct import (`import { lensRoute } from "@lens/core"`) | Daemon wraps all routes. Core provides request tracing. |
| engine ↔ daemon | Direct import (`import { buildContext } from "@lens/engine"`) | Daemon calls engine functions. Never the reverse. |
| daemon ↔ dashboard | HTTP API (`fetch("/api/...")`) | No shared code. Dashboard is a standalone SPA. |
| daemon ↔ cli | HTTP API (`fetch("http://localhost:4111/...")`) | CLI is a thin HTTP client. |
| daemon ↔ MCP client | stdio (JSON-RPC 2.0) | MCP SDK handles transport. Daemon registers tools. |

## Sources

- [Encore.ts — automatic tracing architecture](https://encore.dev/docs/ts/observability/tracing) — HIGH confidence, official docs
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — HIGH confidence, official repo
- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25) — HIGH confidence, official spec
- [Graph-Based Code Analysis Engine](https://rustic-ai.github.io/codeprism/blog/graph-based-code-analysis-engine/) — MEDIUM confidence, reference architecture
- [MLflow TypeScript SDK — function wrapper tracing](https://mlflow.org/docs/3.3.2/genai/tracing/app-instrumentation/typescript-sdk/) — MEDIUM confidence, pattern reference
- LENS v1 implementation (`git show v1-archive:...`) — HIGH confidence, direct experience

---
*Architecture research for: LENS v2 — Structured Code Query Engine*
*Researched: 2026-02-19*
