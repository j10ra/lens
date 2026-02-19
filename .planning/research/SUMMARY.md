# Project Research Summary

**Project:** LENS v2 — Structured Code Query Engine
**Domain:** Local-first code intelligence engine with built-in observability
**Researched:** 2026-02-19
**Confidence:** HIGH

## Executive Summary

LENS v2 is a local-first, deterministic code intelligence engine that queries the structural graph of a codebase — import graph, call graph, co-change pairs, hub files — rather than relying on embeddings or LLMs. The validated approach from v1 is: TF-IDF scoring + import graph signals + co-change analysis from git history. These three signals together outperform embedding-based approaches for code navigation tasks and do so deterministically and cheaply. The architecture is a monorepo with a strict layer hierarchy: core framework primitives (`lensFn`, `lensRoute`, Logger, TraceStore) underpin an engine package with all intelligence logic, which a Hono daemon exposes via HTTP and MCP stdio to thin CLI and React dashboard consumers.

The recommended stack is fully settled and high-confidence: TypeScript 5.9 + Node 22, better-sqlite3 + Drizzle ORM for all local persistence (two separate databases — engine index and trace store), Hono 4.x for the daemon, ts-morph for TypeScript AST analysis, simple-git for git history, and Vite 7 + React 19 + shadcn/ui for the dashboard. Every technology choice has a clear rationale over its alternatives, and all are at stable production-ready versions. The one structural invariant that drives everything else: every engine function must be wrapped in `lensFn()` and every route in `lensRoute()` for automatic observability — this is non-negotiable and must be built into Phase 1 before any intelligence features.

The critical risk for this project is not technical but behavioral: v1 benchmarks definitively showed 0/9 MCP tool adoption rate — AI agents called LENS tools zero times despite proper registration. The fix is architectural: consolidate to 1-2 composite tools returning structural data no built-in tool can replicate (graph context, co-change partners, hub scores), not five granular tools. The second critical risk is the observability layer becoming a bottleneck — TraceStore must include batched writes and retention policy from day one or it becomes a performance problem. Everything else is well-characterized and addressable.

## Key Findings

### Recommended Stack

Full stack is production-ready and well-characterized. No experimental choices except `node:sqlite` (deliberately avoided in favor of better-sqlite3). The core package uses better-sqlite3 + Drizzle ORM for two separate SQLite databases; the engine uses ts-morph for TypeScript AST traversal and simple-git for git history; the daemon uses Hono 4.x on Node.js with `@modelcontextprotocol/sdk` v1.26 for MCP; the dashboard uses Vite 7 + React 19 + Tailwind v4 + shadcn/ui. Build tooling is tsup (packages) + Vite (dashboard), Biome v2 for lint/format.

See `.planning/research/STACK.md` for full version table and alternatives rationale.

**Core technologies:**
- `better-sqlite3 ^12.6`: synchronous, 10x faster than sql.js, native addon — powers all local persistence
- `Drizzle ORM ^0.45`: type-safe SQL-in-TS, zero runtime overhead, schema-as-code — used for both engine index and trace store
- `Hono ^4.11` + `@hono/node-server ^1.19`: 14KB, Web Standards API, runs on Node — daemon HTTP gateway
- `@modelcontextprotocol/sdk ^1.26`: official MCP SDK, `server.registerTool()` API — MCP stdio server
- `ts-morph ^27.0`: wraps TypeScript compiler API, full type resolution — import graph construction
- `simple-git ^3.30`: async git CLI wrapper — co-change analysis, git history
- `Vite ^7.3` + `React ^19.2` + `shadcn/ui (latest)`: React SPA toolchain — dashboard
- `Biome ^2.4`: Rust-based lint+format (replaces ESLint+Prettier), type-aware rules — monorepo dev tooling

### Expected Features

v1 validated the core signals; v2 is about architectural clarity, MCP design, and surface expansion. Competitor analysis confirms co-change analysis is the strongest differentiator — CodeScene charges thousands per year for it; no OSS tool does it. MCP server is table stakes by 2026 (Sourcegraph, ast-grep, CodeGraphContext all ship one).

See `.planning/research/FEATURES.md` for full feature matrix and competitor analysis.

**Must have (table stakes):**
- File indexing with incremental updates — sub-second via git diff-based detection
- Import/dependency graph construction (JS/TS) — foundational data structure
- Reverse dependency lookup ("who imports this?") — impact analysis, trivial once graph exists
- Git history integration — commit counts, last-modified, authorship
- Multi-repo support — pre-v1 requirement, already designed in
- CLI interface — thin HTTP client calling daemon
- MCP server (4 tools: get_context, list_repos, repo_status, index_repo) — primary AI agent interface
- Structured logging — Logger primitive from core package

**Should have (competitive):**
- Co-change analysis from git history — free CodeScene, strongest differentiator
- Hub file detection — high-indegree + high-churn nodes, cheap to compute, unique to OSS space
- Auto-tracing with `lensFn()`/`lensRoute()` — unique observability into the engine itself
- Trace waterfall viewer in dashboard — visual debugging of query execution
- Context-aware grep — matches + structural graph context in one call
- Query kind classification — regex-based, cheap, high-value for ranking strategy selection

**Defer (v2+):**
- Multi-language support (Python, Go, Rust) — JS/TS audience validates first
- Architecture boundary enforcement (Tach-style) — different product category
- Graph diff between commits — niche, high complexity
- Vocab cluster analysis — novel but low priority vs core features

### Architecture Approach

Four-layer architecture with strict boundary rules: Consumer layer (CLI, dashboard, MCP clients) talks only to the daemon via HTTP or stdio. Daemon is a pure gateway — all intelligence delegated to engine. Engine has zero HTTP knowledge. Core is pure infrastructure — no business logic. Dashboard and CLI never import engine or core packages directly. The build dependency chain is: `core → engine → daemon`, with CLI and dashboard as independent HTTP consumers.

See `.planning/research/ARCHITECTURE.md` for full diagram, implementation build order, and anti-patterns.

**Major components:**
1. `@lens/core` — `lensFn()`, `lensRoute()`, Logger, TraceStore (SQLite, Drizzle). No business logic. Foundation for all observability.
2. `@lens/engine` — All intelligence: indexing pipeline (discover→chunk→metadata→import graph→git analysis), scoring (TF-IDF + composite), context builder. Every export via `lensFn()`.
3. `@lens/daemon` — Hono HTTP :4111, MCP stdio, static file serving for dashboard. All routes via `lensRoute()`. Delegates to engine.
4. `apps/dashboard` — Vite + React SPA: trace waterfall, repo explorer, focus mode. HTTP only, never imports engine.
5. `packages/cli` — citty argument parser, thin HTTP client. Zero logic.

**Key patterns:**
- Indexing is a sequential pipeline (discover → chunk → metadata → import graph → git analysis). Each stage is a `lensFn()`. Sequential is correct for local repos; parallelism can be added per-stage later.
- Separate SQLite databases for engine index and trace store — different write patterns, no contention
- `ContextResponse` unified output model — same data serialized as JSON for agents, rendered visually for humans

### Critical Pitfalls

See `.planning/research/PITFALLS.md` for full detail, recovery costs, and verification criteria.

1. **Agent tool adoption failure (0/9 in v1 benchmarks)** — Consolidate to 1-2 composite MCP tools returning structural data no built-in tool replicates (graph context, co-change scores, hub status). Never compete with Grep/Glob. Must be validated with benchmarks before Phase 2.
2. **Observability system becomes bottleneck** — TraceStore must have batched writes (buffer spans, flush every 100ms), separate database from engine index, and retention policy (auto-delete + VACUUM) from day one in Phase 1. Not retrofittable.
3. **SQLite concurrent access under load** — Separate databases for engine index and trace store. WAL mode with `busy_timeout` ≥5000ms on both. Short write transactions during indexing. Never hold write transaction open during file I/O.
4. **"Own repo" blindness** — v1 benchmarks: RLM (own repo) scored 92.1% WITHOUT LENS vs 84.2% WITH. LENS provided +15.8pp improvement on Pinnacle (unfamiliar C# repo). Always benchmark on unfamiliar repos. Optimize for orientation signals (entry points, layers, co-change partners), not targeted lookup.
5. **Graph rendering performance cliff** — Works at 20 nodes, breaks at 200. Use dagre (deterministic hierarchical) not force-directed. Hard cap at 100 visible nodes. Progressive disclosure from day one. Must be architected correctly at Phase 3 — retrofitting is a rewrite.

## Implications for Roadmap

The dependency chain in both architecture and features is clear: core observability framework → engine intelligence pipeline → MCP/daemon exposure → dashboard visualization. Features within each phase group naturally by shared dependencies. The single cross-cutting concern is MCP tool design — it must be validated early (Phase 1) because failure here invalidates the primary value delivery channel.

### Phase 1: Foundation + MCP Proof-of-Concept

**Rationale:** Core package (`lensFn`, `lensRoute`, Logger, TraceStore) has zero dependencies and everything else depends on it. TraceStore design (batching, retention, separate DB) must be correct before any tracing occurs. MCP tool adoption failure is the highest-risk item — validate it while scope is minimal, before building the full engine on top.
**Delivers:** Observable framework infrastructure; working daemon with MCP integration serving a minimal context tool; benchmark proof that agents actually call the tool.
**Addresses:** Core framework (lensFn, Logger, TraceStore), daemon HTTP server, MCP server, CLI skeleton
**Avoids:** Observability bottleneck (batch writes, retention, WAL from day one), SQLite contention (separate DBs), agent adoption failure (tool design validated before Phase 2 builds on it)
**Research flag:** MCP tool design — needs benchmark validation loop. Standard pattern for HTTP daemon setup.

### Phase 2: Intelligence Engine

**Rationale:** With core primitives and DB schema established, the engine can be built with full observability from the start. The feature dependency chain within engine is clear: indexing → import graph → git history → co-change → hub detection → scoring → context builder. Must benchmark on unfamiliar repos before calling this phase complete.
**Delivers:** Full indexing pipeline (incremental, diff-based), import graph construction, co-change analysis, hub detection, TF-IDF + composite scoring, context builder with ranked results.
**Uses:** ts-morph (AST/import graph), simple-git (git history), better-sqlite3 + Drizzle (storage), lensFn wrapping all exports
**Implements:** Engine architecture (db/schema, index/, graph/, scoring/, context/ folders)
**Avoids:** "Own repo" blindness (benchmark on 3+ unfamiliar repos), TF-IDF false confidence (validate top-5 against expert judgment), git log parsing per query (index once, store in co-change table)
**Research flag:** Import resolution edge cases (path aliases, barrel files, circular imports) may need deeper investigation. Co-change on merge-heavy git histories. Standard patterns otherwise.

### Phase 3: Dashboard + Advanced Features

**Rationale:** Dashboard requires daemon (Phase 1) and engine data (Phase 2) to be useful. Graph visualization decisions (dagre vs force-directed, node limits, progressive disclosure) are architectural — must be set up correctly from first render. Context-aware grep and focus mode become natural Phase 3 additions once the underlying data exists.
**Delivers:** React SPA with repo explorer, trace waterfall viewer, focus mode (file neighborhood graph), score breakdown display. Context-aware grep (lens grep). Query kind classification.
**Uses:** Vite 7, React 19, shadcn/ui, Recharts (trace waterfall, stats), dagre (graph layout), TanStack Query (daemon API), TanStack Store (UI state)
**Avoids:** Graph rendering performance cliff (dagre layout, 100-node cap, progressive disclosure, memoized React.memo nodes), layout instability (deterministic layout, cached positions), dashboard "context switch" friction (primary value through MCP/CLI; dashboard secondary)
**Research flag:** Graph visualization library choice (React Flow vs alternatives) may need evaluation with real import graph data. Trace waterfall with 1000+ spans needs performance validation.

### Phase 4: Hardening + v1.x Extensions

**Rationale:** After core product validated, address polish, scaling, and the differentiating features that require v1 data to be meaningful. Vocab cluster analysis makes sense here — it builds on indexed data and enhances ranking but isn't needed for initial validation.
**Delivers:** Vocab cluster analysis, scaling optimizations (WAL tuning, query cache, worker thread indexing), retention policy tuning, multi-repo performance at 50+ repos.
**Avoids:** Premature optimization before Phase 3 validates what's worth optimizing.
**Research flag:** Worker thread integration with better-sqlite3 may need investigation (synchronous API constraints). Skip research-phase for vocab clustering (v1 implementation is reference).

### Phase Ordering Rationale

- **Core before engine:** Engine exports require `lensFn()` — missing core means missing observability everywhere from the start.
- **MCP validated in Phase 1:** Adoption failure risk is existential. If agents won't call the tool, the primary delivery channel is broken. Validate with real benchmarks before Phase 2 commits to the full engine build.
- **Separate DB design in Phase 1:** SQLite contention cannot be retrofitted without schema migration. Two databases (engine index, trace store) from day one.
- **Dashboard after engine data exists:** A dashboard with no real data is untestable and the performance characteristics of graph rendering cannot be evaluated without real import graphs.
- **Retention/batching in TraceStore from Phase 1:** Unbounded trace growth and sync write overhead compound — found in Phase 3, fixed in Phase 3 = rewrite path. Found in Phase 1 = one-time cost.

### Research Flags

Phases needing deeper research during planning:
- **Phase 1:** MCP tool design and agent adoption — run 10+ benchmarks on unfamiliar repos to validate >30% adoption rate before committing to Phase 2.
- **Phase 2:** TypeScript import resolution edge cases (barrel files, path aliases, `tsconfig.paths`, circular imports) — ts-morph handles most, but real-world repos will expose gaps.
- **Phase 3:** Graph visualization library evaluation — React Flow is the default choice but performance at 200+ nodes with dagre layout needs validation against real import graphs before committing.

Phases with standard, well-documented patterns (skip research-phase):
- **Phase 1 (HTTP daemon):** Hono + Node.js adapter is fully documented; standard REST API setup.
- **Phase 2 (git analysis):** simple-git + git log parsing is well-trodden; v1 reference implementation available.
- **Phase 4 (vocab clusters):** v1 had working implementation; agglomerative clustering over TF-IDF vectors is documented.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified against npm, official docs, changelogs. Version compatibility table confirmed. All sources HIGH confidence. |
| Features | HIGH | v1 implementation validated core signals. Competitor analysis complete (Sourcetrail, CodeSee, Sourcegraph, CodeScene, Greptile, Qodo). Feature dependencies mapped explicitly. |
| Architecture | HIGH | v1 implementation is direct reference. Layer boundaries, build order, and integration points are established. Encore.ts pattern well-documented. |
| Pitfalls | HIGH | v1 benchmarks provide empirical data (0/9 MCP adoption, +15.8pp on unfamiliar repos). SQLite behavior from official docs. React Flow performance from official guide. |

**Overall confidence:** HIGH

### Gaps to Address

- **MCP tool adoption:** v1 proved the problem; v2 design is a hypothesis until benchmarked. Do not advance past Phase 1 without empirical adoption data.
- **Import resolution completeness:** ts-morph resolves TypeScript correctly, but path aliases (`tsconfig.paths`), barrel re-exports, and dynamic imports have edge cases. Must test against real-world repos with complex configurations.
- **Graph viz performance with real data:** React Flow + dagre at 200+ nodes is theoretically characterized; real import graphs from large repos (10K+ files) may expose layout computation latency not visible in synthetic tests.
- **MCP SDK v2 timing:** v1.26 is current; v2 expected Q1 2026 (may arrive during implementation). Monitor and evaluate migration cost if it ships with breaking API changes.

## Sources

### Primary (HIGH confidence)
- LENS v1 implementation (`git tag v1-archive`) — architecture patterns, scoring signals, git analysis
- LENS v1 benchmarks (`bench/2026-02-15-*/results.md`) — 0/9 MCP adoption, unfamiliar repo performance data
- [hono - npm](https://www.npmjs.com/package/hono) — v4.11.9
- [better-sqlite3 - npm](https://www.npmjs.com/package/better-sqlite3) — v12.6.2
- [drizzle-orm - npm](https://www.npmjs.com/package/drizzle-orm) — v0.45.1
- [@modelcontextprotocol/sdk - npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — v1.26.0
- [Zod v4 release notes](https://zod.dev/v4) — v4.3.6
- [ts-morph - npm](https://www.npmjs.com/package/ts-morph) — v27.0.2
- [Vite 7.0 announcement](https://vite.dev/blog/announcing-vite7) — v7.3.1
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4) — v4.1
- [shadcn/ui changelog](https://ui.shadcn.com/docs/changelog) — unified radix-ui (Feb 2026)
- [SQLite WAL Mode Documentation](https://sqlite.org/wal.html) — contention model
- [React Flow Performance Guide](https://reactflow.dev/learn/advanced-use/performance) — memoization, node limits
- [Anthropic: Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents) — tool consolidation, semantic output
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — `server.registerTool()` API
- [Encore.ts tracing docs](https://encore.dev/docs/ts/observability/tracing) — lensFn pattern inspiration

### Secondary (MEDIUM confidence)
- [TanStack Store releases](https://github.com/TanStack/store/releases) — v0.10.1
- [citty - npm](https://www.npmjs.com/package/citty) — v0.2.1
- [Graph-Based Code Analysis Engine](https://rustic-ai.github.io/codeprism/blog/graph-based-code-analysis-engine/) — architecture reference
- [MCP Tool Description Quality Research](https://arxiv.org/html/2602.14878v1) — agent tool selection behavior

### Tertiary (LOW confidence / inferred)
- Force-directed vs dagre performance at 200+ nodes with real import graphs — characterized but not empirically validated at LENS scale

---
*Research completed: 2026-02-19*
*Ready for roadmap: yes*
