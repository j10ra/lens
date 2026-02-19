# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Every code query returns structural context — not just matches, but who calls it, what it imports, how hot it is, where it sits in the graph.
**Current focus:** Phase 2 — Intelligence Engine (1/5 plans complete)

## Current Position

Phase: 2 of 4 (Intelligence Engine)
Plan: 1 of 5 in current phase — 02-01 DONE
Status: Engine DB foundation complete. Ready for Plan 02-02 (scoring/indexing pipeline).
Last activity: 2026-02-19 — Plan 02-01 complete (engine scaffold + DB + discovery + chunker + metadata + repo CRUD)

Progress: [██░░░░░░░░] 20% (Phase 2, 1/5 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 5 (01-01, 01-02, 01-03, 01-04, 02-01)
- Average duration: ~3 min
- Total execution time: ~18 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-core-daemon-mcp | 4/4 | ~11 min | ~2.8 min |
| 02-intelligence-engine | 1/5 | ~7 min | ~7 min |

**Recent Trend:**
- Last 5 plans: 01-01 (4 min), 01-03 (3 min), 01-02 (3 min), 01-04 (1 min), 02-01 (7 min)
- Trend: stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Pre-Phase 1]: Do not advance past Phase 1 without MCP adoption benchmark data (empirical proof agents call the tool)
- [Pre-Phase 1]: Two separate SQLite databases (engine index + trace store) — separate write patterns, no contention
- [Pre-Phase 1]: TraceStore must have batched writes and retention from Phase 1 — cannot be retrofitted
- [Phase 1 planning]: Logger writes to stderr everywhere (not stdout) — MCP stdio monopolizes stdout for JSON-RPC
- [01-01]: hono is peerDependency in @lens/core — consumers supply their own instance, no duplicate hono
- [01-01]: skipLibCheck required — drizzle-orm 0.45.1 ships broken .d.ts files for gel/mysql2/singlestore
- [01-01]: CJS __dirname compat via typeof __filename guard — import.meta is {} in tsup CJS builds
- [01-01]: configure*() pattern — global singletons set once at daemon startup, not constructor injection
- [01-03]: @types/node required in CLI devDependencies — process.exit() fails typecheck without Node.js types
- [01-03]: console.log in CLI is correct — CLI is terminal binary, stdout reserved for MCP only in daemon
- [01-03]: ESM-only tsup output for CLI — Node.js 18+ binary, no CJS dual build needed
- [01-02]: @types/node required in daemon devDependencies — same pattern as CLI; process/node:* fail tsc without it
- [01-02]: LENS_MCP env flag for HTTP-only mode — allows curl testing without MCP stdio takeover
- [01-02]: mkdirSync before createTraceStore — ~/.lens/ may not exist on first run; plan explicitly flagged this
- [Post Phase 1]: **MCP and CLI are gates, not logic holders** — both call daemon HTTP routes (`fetch(:4111/...)`), never call engine directly. All logic flows through daemon routes (lensRoute) for unified observability.
- [02-01]: Drizzle migrate() not inline SQL — connection.ts calls migrate() from drizzle-orm/better-sqlite3/migrator, migration generated at packages/engine/drizzle/
- [02-01]: lensFn only on registerRepo() — sync internal helpers (chunker, metadata, identity) stay unwrapped; called from lensFn-wrapped orchestrators above
- [02-01]: drizzle migration path uses __filename CJS compat guard — same pattern as Phase 1 core package

### Pending Todos

None yet.

### Blockers/Concerns

- ~~**MCP adoption risk**: v1 had 0/9 tool adoption.~~ RESOLVED — lens_grep adopted 1/1, gate passed.
- **Phase 4 has no unmapped v1 requirements**: Hardening applies across all requirements. Phase 4 success criteria are performance/stability properties, not feature additions. This is intentional.

## Session Continuity

Last session: 2026-02-19
Stopped at: Phase 2, Plan 01 complete — engine DB foundation, discovery, chunker, metadata, repo CRUD
Resume file: .planning/phases/02-intelligence-engine/02-02-PLAN.md
