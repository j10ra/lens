# LENS v2

## What This Is

A structured code query engine with built-in observability. Queries code as a graph — import graph, call graph, co-change frequency, hub files — instead of treating it as text. Serves AI agents (JSON via MCP) and humans (visual dashboard) through a unified output model. Local-first, no cloud dependency, fully deterministic.

## Core Value

Every code query returns structural context — not just matches, but who calls it, what it imports, how hot it is, where it sits in the graph. One query, two renderers.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] `lensFn()` wrapper that auto-traces every engine function (duration, spans, errors)
- [ ] `lensRoute()` wrapper that auto-traces every Hono handler
- [ ] Structured Logger (replaces all console.log)
- [ ] TraceStore persisting traces to SQLite via Drizzle
- [ ] Dashboard trace waterfall viewer (like Encore.ts)
- [ ] File indexing with TF-IDF scoring
- [ ] Import graph construction and querying
- [ ] Co-change analysis from git history
- [ ] Hub file detection
- [ ] `lens grep` returning match + graph context (callers, importers, hotness)
- [ ] MCP integration (Claude Code, Cursor auto-discover tools)
- [ ] Dashboard repo explorer with graph visualization (focus mode, progressive disclosure)
- [ ] CLI thin shell calling daemon HTTP API
- [ ] Daemon serving HTTP API, MCP stdio, and dashboard static files

### Out of Scope

- Call graph (function-level) — high complexity, defer to post-v1. Import graph + co-change sufficient.
- Cloud/SaaS — local-first only, no remote repo access
- Multi-language support — TypeScript first, other languages post-v1
- VS Code plugin — daemon API is the integration point, plugin later
- SSR/SSG for dashboard — SPA only, no server rendering

## Context

Built from lessons learned from LENS v1 (tagged `v1-archive` in git). v1 proved: TF-IDF + import graph + co-change signals work. Key lesson: structured graph queries are the right layer for code, not keyword matching.

Dead competitors validated the market but failed on execution:
- Sourcetrail (discontinued 2021): desktop app, context switch friction, couldn't monetize
- CodeSee (acqui-hired 2024): cloud-hosted, required external repo access, went AI-first too early

LENS v2 targets AI agents as first-class consumers — a 2025-native insight neither had. MCP distribution is the moat.

## Constraints

- **Stack**: TypeScript monorepo, pnpm workspaces, tsup for packages, Vite for apps
- **Database**: SQLite via better-sqlite3 + Drizzle ORM (local-first, no external DB)
- **Dashboard**: Vite + React SPA, shadcn/ui, TanStack Query (server state), TanStack Store (client micro stores)
- **Observability**: Every function via `lensFn()`, every route via `lensRoute()` — no naked exports
- **Daemon**: Hono HTTP on :4111, MCP stdio transport
- **Lint/Format**: Biome v2
- **Type check**: `tsc --noEmit` after changes

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| `lensFn()` as foundational primitive | Encore-like DX — observability is structural, not bolted on | — Pending |
| Drizzle ORM over raw SQL | Type-safe queries, migration support, SQLite adapter | — Pending |
| TanStack Query + TanStack Store | Lightweight, composable — no Redux/Zustand overhead | — Pending |
| No call graph in v1 | High complexity (dynamic dispatch, HOFs, events). Import graph + co-change sufficient. | — Pending |
| New repo structure over v1 retrofit | `lensFn` touches every function signature — easier to port logic into new shape | — Pending |
| shadcn/ui exclusively | Consistent, accessible, composable. No custom components when shadcn has one. | — Pending |

---
*Last updated: 2026-02-19 after initialization*
