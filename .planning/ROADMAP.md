# Roadmap: LENS v2

## Overview

Four phases following the dependency chain: core observability framework first (everything depends on it), then the intelligence engine (all query signals), then the consumer surfaces (CLI commands + dashboard), then hardening (retention tuning, scaling, polish). MCP adoption is validated in Phase 1 before the full engine is built on top. Graph visualization decisions are locked in at Phase 3 start to avoid a rewrite path.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Core + Daemon + MCP** - Observable framework infrastructure, Hono daemon, MCP server with adoption-validated tool design
- [ ] **Phase 2: Intelligence Engine** - Full indexing pipeline, import graph, co-change analysis, hub detection, composite scoring, context-aware grep
- [ ] **Phase 3: CLI + Dashboard** - All CLI commands with formatted output, React SPA with trace waterfall and repo explorer
- [ ] **Phase 4: Hardening** - Retention tuning, query cache, multi-repo scaling, performance validation at scale

## Phase Details

### Phase 1: Core + Daemon + MCP
**Goal**: The observability framework exists and agents demonstrably call the MCP tool
**Depends on**: Nothing (first phase)
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, CORE-06, DAEM-01, DAEM-02, DAEM-04, CLI-01
**Success Criteria** (what must be TRUE):
  1. Any engine function wrapped in `lensFn()` automatically records duration, span nesting, and errors to TraceStore without any additional instrumentation code
  2. The daemon starts on :4111, responds to HTTP requests, and all routes record request-level traces via `lensRoute()`
  3. Claude Code (or Cursor) auto-discovers the MCP server and the context tool is invoked at least once in a benchmark against an unfamiliar repo — adoption rate above 0/N
  4. TraceStore auto-prunes traces beyond the retention window; unbounded growth cannot occur
  5. The CLI binary starts and calls daemon HTTP endpoints (returns errors gracefully if daemon not running)
**Plans**: 4 plans

Plans:
- [ ] 01-01-PLAN.md — `@lens/core` package: lensFn, lensRoute, Logger, TraceStore (Drizzle schema, batch writes, retention prune)
- [ ] 01-02-PLAN.md — `@lens/daemon` skeleton: Hono HTTP :4111, MCP stdio, lens_context_query stub, all routes via lensRoute
- [ ] 01-03-PLAN.md — `@lens/cli` skeleton: citty, lens status command, daemon HTTP client with graceful error handling
- [ ] 01-04-PLAN.md — MCP adoption benchmark: 3+ unfamiliar repos, validate tool invoked, iterate until adopted (GATE)

### Phase 2: Intelligence Engine
**Goal**: A repo can be indexed and queried — structural context (callers, importers, co-change partners, hub score) returned for any search term
**Depends on**: Phase 1
**Requirements**: ENGN-01, ENGN-02, ENGN-03, ENGN-04, ENGN-05, ENGN-06, ENGN-07, ENGN-08, DAEM-05, DAEM-06
**Success Criteria** (what must be TRUE):
  1. `lens grep "someFunction"` returns matches ranked by composite score with each match showing its importers, co-change partners, and hub status
  2. After registering a repo and triggering an index, the engine has file discovery results, TF-IDF scores, import graph edges, and git co-change data all stored and queryable
  3. Hub files (high-connectivity, high-churn nodes) are identified and surfaced in grep results
  4. Every engine export is wrapped in `lensFn()` — no naked exported functions — confirmed by grep for export patterns
  5. Repo registration, removal, and listing work via daemon API; manual reindex can be triggered and completes without error
**Plans**: TBD

Plans:
- [ ] 02-01: `@lens/engine` DB schema and indexing pipeline — file discovery, chunker, metadata extraction, Drizzle schema for engine index
- [ ] 02-02: Import graph construction with ts-morph — extract import/export edges, store as adjacency table, reverse lookup
- [ ] 02-03: Co-change analysis with simple-git — parse git log, compute pair frequencies, persist to co-change table
- [ ] 02-04: Hub detection and composite scoring — TF-IDF + import graph indegree + co-change frequency → normalized composite score
- [ ] 02-05: Context builder and grep endpoint — `lens grep` query execution, result enrichment with structural metadata, daemon routes for repo management

### Phase 3: CLI + Dashboard
**Goal**: Both human interfaces work — terminal shows formatted structural context, dashboard shows live trace waterfall and browsable repo data
**Depends on**: Phase 2
**Requirements**: CLI-02, CLI-03, DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DAEM-03
**Success Criteria** (what must be TRUE):
  1. `lens grep`, `lens register`, `lens remove`, `lens list`, and `lens status` all work from the terminal with human-readable formatted output
  2. Opening `localhost:4111` in a browser shows the dashboard SPA; the trace waterfall displays route → spans → sub-spans with timing for any daemon request
  3. The repo explorer in the dashboard shows indexed files with metadata (co-change score, hub status, import count); clicking a file shows its structural context
  4. All daemon API calls in the dashboard use TanStack Query with caching and background refetch; UI state (selections, filters) uses TanStack Store
**Plans**: TBD

Plans:
- [ ] 03-01: `@lens/cli` full commands — register, remove, list, status, grep with formatted terminal output
- [ ] 03-02: `apps/dashboard` scaffold — Vite + React SPA, shadcn/ui setup, TanStack Query + Store, daemon API client, routing
- [ ] 03-03: Trace waterfall viewer — route → spans → sub-spans timeline with duration bars, error highlighting
- [ ] 03-04: Repo explorer — indexed file list with metadata columns, file detail panel with structural context
- [ ] 03-05: Daemon static file serving — build integration, `apps/dashboard` served from :4111

### Phase 4: Hardening
**Goal**: The system holds up under real usage — large repos index without timing out, traces don't grow unbounded, and multi-repo setups perform acceptably
**Depends on**: Phase 3
**Requirements**: (No unmapped v1 requirements — hardening applies across all prior requirements)
**Success Criteria** (what must be TRUE):
  1. Indexing a repo with 5,000+ files completes without crashing; co-change analysis on a repo with 10,000+ commits completes within 60 seconds
  2. TraceStore retention policy runs on schedule and trace DB file size stays bounded under continuous use
  3. SQLite WAL mode and busy_timeout are configured on both databases; concurrent dashboard polling and indexing do not deadlock
  4. Dashboard graph rendering (repo explorer) stays responsive with 200+ nodes via dagre layout and hard cap enforcement
**Plans**: TBD

Plans:
- [ ] 04-01: SQLite tuning — WAL mode, busy_timeout, connection pool review for both DBs under concurrent load
- [ ] 04-02: Indexing performance — profiling on large repos, worker thread evaluation for chunking, incremental reindex via git diff
- [ ] 04-03: TraceStore retention validation — auto-prune verification, VACUUM scheduling, size benchmarks under load
- [ ] 04-04: Dashboard graph performance — dagre layout with 200+ node cap, React.memo on node components, progressive disclosure validation

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core + Daemon + MCP | 0/4 | Not started | - |
| 2. Intelligence Engine | 0/5 | Not started | - |
| 3. CLI + Dashboard | 0/5 | Not started | - |
| 4. Hardening | 0/4 | Not started | - |
