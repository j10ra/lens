# Roadmap

## Overview

Four phases following the dependency chain: core observability framework → intelligence engine → consumer surfaces → hardening.

## Completed Phases

### Phase 1: Core + Daemon + MCP (Complete)

**Goal**: Observable framework + agents call MCP tools.

Delivered:
- `lensFn()` auto-traces every engine function (duration, spans, errors)
- `lensRoute()` auto-traces every Hono handler
- Structured Logger, TraceStore (SQLite + Drizzle)
- Daemon on :4111 with HTTP API + MCP stdio
- CLI skeleton (`lens status`)
- MCP adoption validated via benchmark

Plans: 01-01 through 01-04 (core package, daemon skeleton, CLI skeleton, MCP benchmark)

### Phase 2: Intelligence Engine (Complete)

**Goal**: Repo indexed and queryable with structural context.

Delivered:
- File discovery with .gitignore respect
- TF-IDF scoring with code-domain stopwords
- Import graph construction (TS/JS regex-based)
- Git co-change analysis from commit history
- Hub file detection (high indegree + churn)
- Composite scoring combining all signals
- `lens grep` with per-file enrichment (importers, co-change, hub status)
- All exports wrapped in `lensFn()`

Plans: 02-01 through 02-05 (DB schema + discovery, import graph + git, TF-IDF + hubs, grep engine, daemon routes)

### Phase 3: CLI + Dashboard (Complete)

**Goal**: Terminal + browser interfaces work.

Delivered:
- CLI commands: register, remove, list, status, grep, graph, dashboard
- Agent instruction injection on register (CLAUDE.md, AGENTS.md, .cursorrules, etc.)
- MCP config injection (.mcp.json)
- Dashboard SPA served from :4111
- Trace waterfall viewer
- Repo explorer with file metadata
- Galaxy view (3D graph viz) + DAG view toggle
- Command palette search (Cmd+K)

Plans: 03-01 through 03-07 (CLI commands, shared UI, dashboard scaffold, layout, trace waterfall, repo explorer, static serving)

## Remaining

### Phase 4: Hardening (Not Started)

**Goal**: System holds up under real usage.

Planned:
- SQLite WAL tuning, busy_timeout, connection review under concurrent load
- Indexing performance profiling on large repos, worker thread evaluation
- TraceStore retention validation, VACUUM scheduling, size benchmarks
- Dashboard graph performance with 200+ nodes

### Future (v2+)

- Multi-language parser support (Python, Go, Rust via parser registry)
- File watcher for incremental reindexing
- Change-impact analysis tool (`lens_impact`)
- Architecture boundary enforcement
- VS Code extension (thin client over daemon API)

## Requirements Coverage

All 29 v1 requirements mapped and completed:
- Core Framework (CORE-01 through CORE-06): Phase 1
- Code Intelligence (ENGN-01 through ENGN-08): Phase 2
- Daemon (DAEM-01 through DAEM-06): Phases 1-3
- CLI (CLI-01 through CLI-03): Phases 1, 3
- Dashboard (DASH-01 through DASH-06): Phase 3
