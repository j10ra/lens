# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## RLM — Repo Context Daemon

`rlm context "<goal>"` — dependency graph, co-changes, file activity, cross-layer file discovery

### Development Commands

**Daemon**:

- `encore run` — Start daemon (binds to 127.0.0.1:4000, NOT localhost)
- Restart daemon after: SQL migrations, service code changes

**CLI**:

- `cd packages/rlm-cli && npm run build` — Rebuild CLI (no re-link needed after first install)

**Testing**:

- `encore test` — Run tests with infrastructure setup
- `vitest` runs directly without Encore infrastructure

### Key Implementation Notes

**Migrations**: `encore run` must be restarted for new migrations (no hot-reload for SQL). Use numbered format: `001_name.up.sql`

**Database**: `repo/db.ts` exports named `db` resource — DB resources cannot be default-exported

**File watchers**: In-memory per repo — stop on daemon restart, re-enable with `rlm repo watch`

**Embeddings**: Voyage AI `voyage-code-3` (1024 dim). Lazy: only chunks where `embedding IS NULL`. Secret: `VoyageApiKey` via `encore secret set --type dev`

**Advisory locks**: `repo/lib/identity.ts` hashes UUID to 32-bit int for `pg_advisory_lock`

**Context pack**: Zero LLM calls — TF-IDF keyword matching + Voyage semantic boost + structural enrichment (forward/reverse imports, 2-hop deps, co-changes, git stats). Cached 120s.
