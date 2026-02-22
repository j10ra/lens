# Design Decisions

## Core Architecture

| Decision | Rationale |
|----------|-----------|
| `lensFn()` as foundational primitive | Encore-like DX — observability is structural, not bolted on. Every engine function auto-traced. |
| Separate SQLite DBs for index + traces | Different write patterns. Prevents indexing from blocking trace writes. |
| MCP & CLI as HTTP gates | All entry points funnel through daemon routes — unified observability, single code path. |
| No call graph in v1 | High complexity (dynamic dispatch, HOFs, events). Import graph + co-change sufficient. |
| New repo structure over v1 retrofit | `lensFn` touches every function signature — easier to port logic into new shape. |
| shadcn/ui exclusively | Consistent, accessible, composable. No custom components when shadcn has one. |
| Drizzle ORM over Prisma | Type-safe, zero overhead, native better-sqlite3 driver. No code generation step. |
| TanStack Query + Store | Lightweight, composable — no Redux/Zustand overhead. Query for server state, Store for UI state. |
| Hono over Express/Fastify | 14KB, Web Standards API. Lighter than Fastify, modern unlike Express. |
| better-sqlite3 over sql.js | 10x faster, native addon OK for Node.js. sql.js is WASM, only for browser. |
| tsup for packages, Vite for apps | tsup handles ESM/CJS dual output. Vite for React SPA with HMR. |
| Biome v2 over ESLint+Prettier | Single tool, 10-100x faster (Rust), type-aware rules. |
| No embeddings/vector DB | Deterministic structural queries are the core thesis. Same query = same result, always. |

## Parser Architecture

| Decision | Rationale |
|----------|-----------|
| Per-language parser interface (`LanguageParser`) | Adding a language = one directory + registration. No editing multiple files. |
| Registry pattern with `getParser(lang)` | Callers don't care about language-specific logic. Clean dispatch. |
| Regex-based parsing (not AST) | Fast, no dependencies, sufficient for import/export extraction. AST for future deep analysis. |
| Common utilities in `parsers/common/` | Section extraction, universal internals shared across languages. |

## MCP Tool Design

| Decision | Rationale |
|----------|-----------|
| 3 focused tools over monolithic `get_context` | v1 had 4 granular tools with 0% adoption. v2 consolidates: `lens_grep`, `lens_graph`, `lens_graph_neighbors`. |
| Composite results per tool | Each call returns structural context no built-in Grep/Glob can replicate. |
| Agent instruction injection on register | Benchmarks showed 67% adoption with instructions vs ~0% without. Injection into CLAUDE.md, AGENTS.md, etc. |
| HTTP Streamable transport | Simpler than stdio for multi-client. Daemon serves both MCP and REST on same port. |

## Dashboard

| Decision | Rationale |
|----------|-----------|
| Galaxy view (3D) + DAG view toggle | Galaxy for exploration/orientation. DAG for precise dependency tracing. |
| d3-force-3d for galaxy layout | 3D positioning of clusters. LOD with InstancedMesh keeps draw calls low. |
| dagre for DAG layout | Deterministic hierarchical layout. Same graph = same positions. No layout jumping. |
| Command palette (Cmd+K) | Primary navigation. Grep-powered autocomplete ranked by hub score. |
| Progressive disclosure | Default: clusters. Click: expand to files. Click: file detail panel. Max 2 hops. |
| Node cap at 500 visible | Performance cliff at 200+ with React components. InstancedMesh + LOD prevents this. |

## Lessons from v1

| Lesson | Impact on v2 |
|--------|-------------|
| TF-IDF + import graph + co-change signals work | Kept all three. Core scoring pipeline unchanged. |
| Structured graph queries > keyword matching | Doubled down. Every result includes graph context. |
| Agents don't adopt MCP tools voluntarily | Added instruction injection. Prepend LENS usage to agent config files. |
| Value scales with unfamiliarity | Marketing and benchmarks focus on "new codebase" use case. |
| better-sqlite3 10x faster than sql.js | Kept native addon. Acceptable install complexity. |
| tsup ESM+CJS interop needs createRequire | Banner injects polyfills. Already handled. |

## Technology Choices

| Technology | Version | Purpose |
|-----------|---------|---------|
| TypeScript | ^5.9 | Language |
| Node.js | >=22 | Runtime |
| pnpm | ^10 | Package manager (workspace protocol) |
| Hono | ^4.11 | HTTP framework |
| better-sqlite3 | ^12.6 | SQLite driver |
| Drizzle ORM | ^0.45 | Type-safe SQL |
| MCP SDK | ^1.26 | MCP server (`server.registerTool()`) |
| React | ^19.2 | Dashboard UI |
| Vite | ^7.3 | Dashboard build |
| Tailwind CSS | ^4.1 | Utility CSS |
| shadcn/ui | latest | Component library |
| TanStack Query | ^5.90 | Server state |
| Biome | ^2.3 | Lint + format |
| tsup | ^8.5 | Package bundler |
| citty | ^0.2 | CLI framework |

## What We Explicitly Avoid

| Avoid | Reason | Use Instead |
|-------|--------|-------------|
| Embeddings / vector DB | Non-deterministic, unexplainable rankings | TF-IDF + graph signals |
| OpenTelemetry | 50+ packages, designed for distributed systems | Custom TraceStore with lensFn |
| Prisma | Heavy runtime, code gen, slower queries | Drizzle ORM |
| Express | Legacy callback model, no native async | Hono |
| Redux | Massive boilerplate | TanStack Store |
| SSR for dashboard | Local SPA, no SEO needed | Vite + React SPA |
| Cloud/SaaS | Local-first, no remote access | Everything runs on user's machine |
| Real-time file watching (v1) | Platform-dependent, race conditions | Index on register or query if stale |
