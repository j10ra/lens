# CLAUDE.md

## LENS — Local-First Repo Context Engine

Indexes codebases and serves context packs to AI agents.

### LENS MCP

This repo is indexed by LENS. Use `mcp__lens__get_context` or `lens context "<goal>"` to find relevant files, imports, and co-change clusters — especially useful when unsure where to start or understanding cross-cutting concerns.

### Monorepo Structure (pnpm workspaces)

```
apps/
  daemon/       ← Layer 2: Hono HTTP :4111 + MCP stdio server
  dashboard/    ← Local daemon dashboard (React SPA, shadcn, Vite)
  cloud/        ← Layer 3: TanStack Start SSR (admin) + Hono API
  web/          ← Static marketing site (TanStack Start)
  encore/       ← Legacy Encore app (Postgres, reference only)
packages/
  engine/       ← Layer 1: core logic, SQLite (tsup, ESM+CJS)
  cli/          ← CLI tool (`lens` command, tsc, ESM)
  cloud-db/     ← Shared Drizzle schema + queries (Postgres/Supabase)
  ui/           ← Shared UI components (shadcn, source-only)
```

### Development Commands

- `pnpm install` — install all deps
- `pnpm -r build` — build everything
- `pnpm --filter @lens/engine build` — engine only
- `pnpm --filter @lens/daemon build` — daemon only
- `pnpm --filter @lens/dashboard build` — dashboard only
- `pnpm --filter @lens/cli build` — CLI only
- `pnpm -w build:publish` — bundle for global install
- `pnpm -w deploy:local` — build + install globally + restart daemon

### Type Checking

Always run `tsc --noEmit` after code changes. Biome only catches lint/format issues, not type errors.

- `pnpm --filter @lens/cloud typecheck` — cloud app
- `pnpm --filter @lens/engine typecheck` — engine

### Key Architecture

- **Engine** (`packages/engine`): SQLite via better-sqlite3 + Drizzle ORM. Tables: repos, chunks, file_metadata, file_imports, file_stats, file_cochanges, usage_counters, request_logs
- **Daemon** (`apps/daemon`): Hono HTTP on :4111. Serves REST API + MCP stdio + dashboard SPA. SSE for real-time updates.
- **CLI** (`packages/cli`): `lens` command — register, status, context, login/logout, dashboard
- **Cloud** (`apps/cloud`): Headless Hono API (auth, keys, usage, proxy, billing) + TanStack Start admin panel
- **Dashboard** (`apps/dashboard`): React SPA served by daemon at `/dashboard/`. TanStack Router + React Query + shadcn

### Context Pack Pipeline

`POST /context { repo_id, goal }` → ~10ms cached, ~0.5-7s cold:

1. Auto-index (diff scan if HEAD changed)
2. TF-IDF keyword scoring (code-domain stopwords, path tokens, exports, docstrings)
3. Concept expansion (static synonyms + vocab clusters)
4. Co-change promotion
5. Semantic boost (Voyage vector search, Pro only — adds ~100-300ms)
6. Structural enrichment (imports, 2-hop deps, co-changes, git activity)
7. Cache (120s TTL, 20 entries)

### Indexing Pipeline

Two stages: **core index** (always runs) and **enrichment** (only on explicit triggers).

#### Core Index — `runIndex()` in `packages/engine/src/index/engine.ts`

1. Discovery — diff scan (changed files since last commit) or full scan (`--force`)
2. Chunking — split files into indexed chunks
3. `extractAndPersistMetadata()` — exports, imports, docstrings, sections, internals
4. `buildAndPersistImportGraph()` — directed import edges
5. `computeMaxImportDepth()` — BFS from leaves
6. `analyzeGitHistory()` — commit counts, co-change pairs

#### Enrichment — post-index tasks in `apps/daemon/src/server.ts`

Runs after core index, guarded by per-repo toggles + capabilities + quota:

1. `buildVocabClusters()` — Voyage-embed terms, cosine cluster >0.75
2. `ensureEmbedded()` — Voyage vector embeddings for semantic search
3. `enrichPurpose()` — LLM-generated file purpose summaries

#### Trigger Matrix

| Trigger | Core Index | Enrichment |
|---|---|---|
| `lens repo register` / `POST /repo/register` | full scan | yes |
| `lens index` / `POST /index/run` | diff scan (or full if `--force`) | yes |
| `lens context` / `POST /context` | diff scan via `ensureIndexed()` | **no** |
| File watcher (chokidar) | diff scan via `runIndex()` | **no** |

Enrichment = expensive API calls (Voyage, LLM). Only explicit user actions trigger it.

### Per-Repo Feature Toggles

Each repo has three independent flags (default: enabled):
- `enable_embeddings` — vector embeddings for semantic search
- `enable_summaries` — LLM purpose summaries
- `enable_vocab_clusters` — Voyage term clustering

Toggle via dashboard UI or `PATCH /api/dashboard/repos/:id/settings`.

### File Watchers

In-memory per repo — stop on daemon restart, re-enable with `lens repo watch`.
