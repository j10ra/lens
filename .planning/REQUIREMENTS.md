# Requirements: LENS v2

**Defined:** 2026-02-19
**Core Value:** Every code query returns structural context — not just matches, but who calls it, what it imports, how hot it is, where it sits in the graph.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Core Framework

- [x] **CORE-01**: `lensFn()` wraps any function with auto-tracing (duration, input/output size, nested spans, errors)
- [x] **CORE-02**: `lensRoute()` wraps Hono handlers with request-level tracing (method, path, status, duration)
- [x] **CORE-03**: Structured Logger with levels (info, warn, error, debug) correlated to active trace
- [x] **CORE-04**: TraceStore persists traces to SQLite via Drizzle with queryable schema
- [x] **CORE-05**: Drizzle ORM configured for SQLite with better-sqlite3 driver, migrations support
- [x] **CORE-06**: Trace retention policy (auto-prune old traces to prevent unbounded growth)

### Code Intelligence

- [ ] **ENGN-01**: File discovery scans repo, respects .gitignore, detects file types
- [ ] **ENGN-02**: TF-IDF scoring computes term relevance across indexed files
- [ ] **ENGN-03**: Import graph construction extracts import/export edges from TypeScript files
- [ ] **ENGN-04**: Co-change analysis parses git log to identify files that change together
- [ ] **ENGN-05**: Hub file detection identifies high-connectivity files via import graph + co-change signals
- [ ] **ENGN-06**: Composite scoring combines TF-IDF, import graph, co-change, and hub signals
- [ ] **ENGN-07**: `lens grep "foo|bar|baz"` returns matches per term, ranked by composite score (hub, import graph, co-change, hotness), each match enriched with structural metadata
- [ ] **ENGN-08**: Every engine function wrapped in `lensFn()` — no naked exports

### Daemon

- [ ] **DAEM-01**: Hono HTTP server on :4111 with JSON API
- [ ] **DAEM-02**: MCP stdio server exposing engine capabilities as tools
- [ ] **DAEM-03**: Serves dashboard static files from built SPA
- [ ] **DAEM-04**: All routes wrapped in `lensRoute()` — no naked handlers
- [ ] **DAEM-05**: Repo registration and management (add/remove/list repos)
- [ ] **DAEM-06**: Index trigger endpoint (manual reindex)

### CLI

- [ ] **CLI-01**: Thin CLI shell that calls daemon HTTP API
- [ ] **CLI-02**: Commands: register, remove, list, status, grep
- [ ] **CLI-03**: Formatted terminal output for human readability

### Dashboard

- [ ] **DASH-01**: Vite + React SPA with shadcn/ui components
- [ ] **DASH-02**: Trace waterfall viewer showing route → spans → sub-spans with timing
- [ ] **DASH-03**: Repo file explorer with indexed file list and metadata
- [ ] **DASH-04**: TanStack Query for all daemon API calls (caching, refetching)
- [ ] **DASH-05**: TanStack Store for client-side UI state (selections, filters)
- [ ] **DASH-06**: Connects to daemon API on localhost:4111

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Query

- **ADVQ-01**: Query classification (exploratory vs targeted vs change-impact)

### Dashboard Advanced

- **DSHA-01**: Graph visualization with focus mode (one node center, context fades with distance)
- **DSHA-02**: Progressive disclosure (file → functions → imports, max 2 hops before collapse)
- **DSHA-03**: Command palette search with autocomplete ranked by hub score, recency, co-change

### Engine Advanced

- **ENGA-01**: Vocab/concept clusters for query expansion
- **ENGA-02**: File watcher for incremental reindexing on change
- **ENGA-03**: Worker thread indexing for large repos

## Out of Scope

| Feature | Reason |
|---------|--------|
| Call graph (function-level) | High complexity (dynamic dispatch, HOFs, events). Import graph + co-change sufficient for v1. |
| Cloud/SaaS hosting | Local-first only, no remote repo access |
| Multi-language support | TypeScript first, pluggable parsers later |
| VS Code plugin | Daemon API is the integration point, plugin is a thin UI layer |
| Embeddings/vector DB | Deterministic structural queries are the core thesis |
| SSR for dashboard | SPA only, no server rendering needed |
| Real-time file watching | Manual reindex for v1, watcher in v2 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | Phase 1 | Complete |
| CORE-02 | Phase 1 | Complete |
| CORE-03 | Phase 1 | Complete |
| CORE-04 | Phase 1 | Complete |
| CORE-05 | Phase 1 | Complete |
| CORE-06 | Phase 1 | Complete |
| ENGN-01 | Phase 2 | Pending |
| ENGN-02 | Phase 2 | Pending |
| ENGN-03 | Phase 2 | Pending |
| ENGN-04 | Phase 2 | Pending |
| ENGN-05 | Phase 2 | Pending |
| ENGN-06 | Phase 2 | Pending |
| ENGN-07 | Phase 2 | Pending |
| ENGN-08 | Phase 2 | Pending |
| DAEM-01 | Phase 1 | Pending |
| DAEM-02 | Phase 1 | Pending |
| DAEM-03 | Phase 3 | Pending |
| DAEM-04 | Phase 1 | Pending |
| DAEM-05 | Phase 2 | Pending |
| DAEM-06 | Phase 2 | Pending |
| CLI-01 | Phase 1 | Pending |
| CLI-02 | Phase 3 | Pending |
| CLI-03 | Phase 3 | Pending |
| DASH-01 | Phase 3 | Pending |
| DASH-02 | Phase 3 | Pending |
| DASH-03 | Phase 3 | Pending |
| DASH-04 | Phase 3 | Pending |
| DASH-05 | Phase 3 | Pending |
| DASH-06 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-19 after roadmap creation — all 29 v1 requirements mapped*
