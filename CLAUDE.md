# CLAUDE.md

## LENS v2 — Structured Code Query Engine

Code is a graph, not a document. LENS queries the structure directly — import graph, call graph, co-change frequency, hub files. No embeddings, no vector DB, fully deterministic and reproducible.

### Architecture

```
packages/
  core/       ← Framework primitives: lensFn, lensRoute, Logger, TraceStore
  engine/     ← Code intelligence: indexing, scoring, graphs, co-change, hubs
  cli/        ← Thin CLI shell, calls daemon HTTP API
apps/
  daemon/     ← Hono HTTP server :4111, MCP stdio, serves dashboard
  dashboard/  ← Vite + React SPA: trace viewer, repo explorer, graph viz
```

### Package Responsibilities

- **core** — Observability foundation. `lensFn()` wraps engine functions with auto-tracing (duration, spans, errors). `lensRoute()` wraps Hono routes. Logger (structured, not console.log). TraceStore (SQLite). No business logic.
- **engine** — All code intelligence. Indexing, TF-IDF scoring, import graph, call graph, co-change analysis, hub detection, git history. Every function wrapped in `lensFn`. No HTTP knowledge.
- **daemon** — HTTP gateway (Hono). All routes use `lensRoute`. Serves MCP stdio. Serves dashboard static files. Single entry point for CLI, MCP, and dashboard.
- **dashboard** — Vite + React SPA. Always use shadcn components. Trace waterfall viewer, repo explorer, graph visualization. Connects to daemon API.
- **cli** — Thin argument parser. Calls daemon HTTP endpoints. No logic.

### Request Flow

MCP and CLI are gates — both call daemon HTTP routes. No in-process shortcuts.

```
MCP ──→ fetch(:4111/grep) ──┐
CLI ──→ fetch(:4111/grep) ──┤── daemon route (lensRoute) → engine (lensFn) → TraceStore
Dashboard ─→ fetch(:4111) ──┘
```

All logic flows through daemon routes for unified observability. Every request — regardless of entry point — produces traces in TraceStore and is visible in the dashboard.

### Conventions

- **UI**: Always use shadcn/ui components in dashboard. No custom components when shadcn has one.
- **Functions**: Wrap in `lensFn()` — never write naked exported functions in engine.
- **Routes**: Wrap in `lensRoute()` — never write naked Hono handlers in daemon.
- **Gates**: MCP and CLI call daemon HTTP — never call engine directly. No in-process shortcuts.
- **Logging**: Use `Logger.info/warn/error()` — never use `console.log()` in daemon.
- **Build**: tsup for packages, Vite for apps.
- **Type check**: `tsc --noEmit` after changes. Biome doesn't catch TS errors.

### Development Commands

- `pnpm install` — install all deps
- `pnpm -r build` — build everything
- `pnpm --filter @lens/core build` — core only
- `pnpm --filter @lens/engine build` — engine only
- `pnpm --filter @lens/daemon build` — daemon only
- `pnpm --filter @lens/dashboard build` — dashboard only
- `pnpm --filter @lens/cli build` — CLI only

### v1 Reference

Previous implementation archived at git tag `v1-archive`. Access with:
```
git show v1-archive:packages/engine/src/scoring.ts
```
