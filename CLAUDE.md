# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## RLM — Repo Context Daemon

Available when native search returns too many results or for orientation in unfamiliar repos.

- `rlm search "<query>"` — hybrid grep+semantic code search
- `rlm read <path>` — read full file via daemon
- `rlm task "<goal>"` — compressed context pack (repo map + relevant files)
- `rlm run "<cmd>"` — sandboxed test/build (npm, cargo, python, git)

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

**Embeddings**: bge-small-en-v1.5 (384 dim). Lazy embedding: only chunks where `embedding IS NULL`. Secret: `ZaiApiKey` via `encore secret set --type dev`

**Advisory locks**: `repo/lib/identity.ts` hashes UUID to 32-bit int for `pg_advisory_lock`

**Context pack design** (Phase 5): Zero LLM calls on hot path — pure retrieval (~233ms). Compressed format with repo map + file index + snippets. Planning offloaded to receiving agent, not RLM.
