# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Consumer Layer                          │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   CLI    │  │  Dashboard   │  │  MCP Client  │           │
│  │  (thin)  │  │  (React SPA) │  │ (Claude/etc) │           │
│  └────┬─────┘  └──────┬───────┘  └──────┬───────┘           │
│       │  HTTP          │  HTTP           │  stdio            │
├───────┴────────────────┴─────────────────┴───────────────────┤
│                      Gateway Layer                           │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                 Daemon (Hono :4111)                      │ │
│  │  lensRoute() wraps every handler → auto request tracing │ │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐     │ │
│  │  │ /api/*  │ │ /mcp    │ │ /dash/*  │ │ /health  │     │ │
│  │  └────┬────┘ └────┬────┘ └────┬─────┘ └──────────┘     │ │
│  └───────┼────────────┼──────────┼─────────────────────────┘ │
├──────────┴────────────┴──────────┴───────────────────────────┤
│                    Intelligence Layer                         │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                 Engine (@lens/engine)                    │ │
│  │  lensFn() wraps every function → auto span tracing      │ │
│  │  ┌────────────┐ ┌────────────┐ ┌───────────────┐        │ │
│  │  │  Indexing   │ │  Scoring   │ │  Query Build  │        │ │
│  │  │  Pipeline   │ │  Engine    │ │  (context)    │        │ │
│  │  └──────┬─────┘ └──────┬─────┘ └───────┬───────┘        │ │
│  │  ┌──────┴─────┐ ┌──────┴─────┐ ┌───────┴──────┐         │ │
│  │  │ Discovery  │ │ Import     │ │ Co-change    │         │ │
│  │  │ Metadata   │ │ Graph      │ │ Analysis     │         │ │
│  │  │ Parsers    │ │ Hub Det.   │ │ Git History  │         │ │
│  │  └────────────┘ └────────────┘ └──────────────┘         │ │
│  └─────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│                     Foundation Layer                          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                 Core (@lens/core)                        │ │
│  │  ┌──────────┐ ┌────────────┐ ┌────────┐ ┌────────────┐  │ │
│  │  │ lensFn() │ │lensRoute() │ │ Logger │ │ TraceStore │  │ │
│  │  └──────────┘ └────────────┘ └────────┘ └─────┬──────┘  │ │
│  └───────────────────────────────────────────────┼──────────┘ │
├──────────────────────────────────────────────────┼────────────┤
│                      Storage Layer                │            │
│  ┌───────────────────────────────────────────────┼──────────┐ │
│  │               SQLite (better-sqlite3)          │          │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────┴─────┐    │ │
│  │  │  repos   │ │ metadata │ │  graphs  │ │  traces  │    │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Package Responsibilities

| Package | Responsibility | Communicates With |
|---------|----------------|-------------------|
| **@lens/core** | Framework primitives: `lensFn()`, `lensRoute()`, Logger, TraceStore. Zero business logic. | SQLite (trace writes), consumed by engine + daemon |
| **@lens/engine** | All code intelligence: indexing, scoring, graphs, co-change, hubs. Every fn wrapped in `lensFn()`. | core (tracing), SQLite (data read/write) |
| **@lens/daemon** | HTTP gateway (Hono :4111). MCP stdio server. Static file server for dashboard. All routes via `lensRoute()`. | engine (calls intelligence fns), core (tracing) |
| **@lens/dashboard** | Vite + React SPA. Trace waterfall, repo explorer, graph viz. | daemon (HTTP API only) |
| **@lens/cli** | Thin argument parser. No logic. | daemon (HTTP API only) |

## Boundary Rules

1. **Engine has no HTTP knowledge** — receives structured args, returns structured results
2. **Daemon has no intelligence logic** — delegates all computation to engine
3. **Core has no business logic** — purely infrastructure (tracing, logging, storage)
4. **Dashboard and CLI only talk to daemon HTTP API** — never import engine or core directly
5. **All engine functions observable** — `lensFn()` wrapping is structural, not optional

## Project Structure

```
packages/
├── core/                  # Framework primitives
│   └── src/
│       ├── lens-fn.ts     # lensFn() — function wrapper with auto-tracing
│       ├── lens-route.ts  # lensRoute() — Hono route wrapper
│       ├── logger.ts      # Structured Logger (replaces console.log)
│       ├── trace-store.ts # TraceStore — SQLite persistence via Drizzle
│       ├── schema.ts      # Drizzle schema for traces/spans
│       └── index.ts       # Public API barrel
│
├── engine/                # Code intelligence
│   └── src/
│       ├── db/            # SQLite schema, connection, typed queries
│       ├── index/         # Indexing pipeline (discovery, metadata, import graph, git)
│       ├── graph/         # Graph queries (summary, detail, neighbors)
│       ├── grep/          # Ranked search (TF-IDF, composite scoring, structural)
│       ├── parsers/       # Per-language parser registry
│       │   ├── types.ts       # LanguageParser interface
│       │   ├── registry.ts    # getParser(lang) dispatch
│       │   ├── common/        # Shared utilities (resolve, patterns)
│       │   └── typescript/    # TS/JS parser implementation
│       └── index.ts       # Public API barrel (all exports wrapped in lensFn)
│
├── cli/                   # Thin CLI shell
│   └── src/
│       ├── commands/      # One file per command
│       ├── lib/           # daemon HTTP client, injection utilities
│       └── index.ts       # Entry point (citty)
│
└── ui/                    # Shared shadcn components
    └── src/components/    # Reusable across dashboard

apps/
├── daemon/                # HTTP + MCP gateway
│   └── src/
│       ├── routes/        # Hono route modules (all use lensRoute)
│       ├── http.ts        # Hono app assembly, middleware, routing
│       ├── mcp.ts         # MCP stdio server + tool registration
│       └── index.ts       # Entry point (start server)
│
├── dashboard/             # React SPA
│   └── src/
│       ├── components/    # shadcn-based UI components
│       ├── pages/         # Route-level views (Traces, Explore, Navigator)
│       ├── queries/       # TanStack Query hooks
│       └── lib/           # API client, graph layout, utils
│
└── web/                   # Landing site (TanStack Start)
    └── app/
        ├── components/    # Landing page sections
        └── routes/        # Pages (docs, privacy, terms)
```

## Data Flows

### Query Flow

```
Consumer (CLI/MCP/Dashboard)
    ↓  HTTP request
Daemon (lensRoute → trace)
    ↓  Parse request
Engine: grep pipeline
    ├── TF-IDF scoring against indexed files
    ├── Import graph: hub bonus, reverse deps
    ├── Co-change: frequently changed together bonus
    └── Composite scoring: combine all signals
    ↓
Daemon: serialize JSON + persist trace
    ↓
Consumer: render results
```

### Indexing Flow

```
Trigger: lens register / manual reindex
    ↓
Discovery: git diff or full scan → file list
    ↓
Metadata: parser registry extracts imports, exports, docstrings
    ↓
Import graph: resolve specifiers → edges table
    ↓
Git analysis: git log → commit counts, co-change pairs
    ↓
repo.index_status = "ready"
```

### Trace Flow

```
Request → lensRoute creates trace
    ↓
Engine functions → lensFn creates child spans
    ↓
All spans complete → TraceStore batch writes to SQLite
    ↓
Dashboard polls /api/traces → renders waterfall
```

## Key Patterns

### lensFn() — Automatic Function Instrumentation

Every engine function wrapped in `lensFn()`. Captures timing, nested spans, errors. ~microsecond overhead.

```typescript
export const buildImportGraph = lensFn(
  "engine.buildImportGraph",
  (db: Db, repoId: string): number => { /* logic */ },
);
```

### lensRoute() — Request-Level Tracing

Every daemon route wrapped in `lensRoute()`. Creates request-scoped trace linking to child spans.

```typescript
app.post("/grep", lensRoute("grep.post", async (c) => { /* handler */ }));
```

### Parser Registry — Pluggable Language Support

Per-language parsers implement `LanguageParser` interface. Registry dispatches by language string. Adding a new language = one directory + registration.

```typescript
interface LanguageParser {
  languages: string[]
  extractImports(content: string): string[]
  extractExports(content: string): string[]
  resolveImport(specifier: string, sourcePath: string, knownPaths: Set<string>): string | null
  // ...
}
```

## Anti-Patterns

| Anti-Pattern | Why Wrong | Do Instead |
|-------------|-----------|------------|
| Naked exports in engine | Breaks observability, trace waterfall shows gaps | Always wrap in `lensFn()` |
| Engine imports Hono types | Couples intelligence to transport, untestable | Engine receives plain TS args |
| Dashboard imports engine | Engine uses Node APIs (fs, sqlite), fails in browser | Dashboard talks to daemon HTTP API only |
| Fat CLI with logic | Duplicates daemon, CLI and MCP diverge | CLI is thin HTTP client |
| Global mutable state in engine | Race conditions, memory leaks | Pass db handle explicitly |

## Storage

Two separate SQLite databases:
- **~/.lens/index.db** — Engine data (repos, metadata, imports, cochanges, file_stats)
- **~/.lens/trace.db** — Trace data (traces, spans)

Separation prevents write contention between indexing and tracing. Both use WAL mode with `busy_timeout`.

## Build Order

```
@lens/core         ← no internal deps, build first
    ↓
@lens/engine       ← depends on core
    ↓
@lens/daemon       ← depends on core + engine
@lens/cli          ← depends on daemon (HTTP only)
@lens/dashboard    ← depends on daemon (HTTP only)
```
