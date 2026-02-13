---
name: doc
description: Update architecture docs based on code changes since last sync
---

# /doc — Update Architecture Docs

## Current State

**HEAD:** !`git rev-parse HEAD`

**Last sync hash:** !`sed -n 's/.*doc-sync: \([a-f0-9]*\).*/\1/p' docs/ARCHITECTURE.md`

**Changed files since last sync:**
!`SYNC=$(sed -n 's/.*doc-sync: \([a-f0-9]*\).*/\1/p' docs/ARCHITECTURE.md) && if [ -n "$SYNC" ]; then git diff --name-status "$SYNC"..HEAD; else echo "NO SYNC HASH FOUND"; fi`

**Diff summary:**
!`SYNC=$(sed -n 's/.*doc-sync: \([a-f0-9]*\).*/\1/p' docs/ARCHITECTURE.md) && if [ -n "$SYNC" ]; then git diff --stat "$SYNC"..HEAD; else echo "NO SYNC HASH FOUND"; fi`

## Doc Structure

### Architecture — `docs/ARCHITECTURE.md`

Single file, all sections. Diagram: `docs/architecture.drawio`.

| Section | Source packages | What to update |
|---------|-----------------|----------------|
| Layer 1: Engine | `packages/engine/` | SQLite tables, indexing pipeline, context pipeline, scoring formula, tracing |
| CLI | `packages/cli/` | Commands, daemon auto-start |
| Layer 2: Daemon | `apps/daemon/` | Entry point, route groups, request logging, watchers, SSE, timers, MCP |
| Authentication | `packages/cli/`, `apps/cloud/src/middleware/auth.ts` | Login flow, API key validation, token refresh |
| Capabilities | `apps/daemon/src/cloud-capabilities.ts` | Pro lifecycle, cloud caps factory, free vs pro, toggles |
| Layer 3: Cloud | `apps/cloud/` | Quota enforcement, rate limiting, admin panel, Supabase tables |
| Telemetry | `packages/engine/src/telemetry.ts`, `apps/cloud/src/routes/telemetry.ts` | Events, pipeline, identifiers |
| Billing | `apps/cloud/src/routes/billing.ts` | Stripe plans, checkout, webhooks |
| Data Flows | (cross-cutting) | End-to-end request paths |

### Deployment — `docs/deployment.md`

Single file. Diagram: `docs/deployment.drawio`.

| Section | What triggers an update |
|---------|------------------------|
| npm Package | Changes to `tsup.config.publish.ts`, `publish.json`, `scripts/release.sh`, build scripts |
| Railway (Cloud) | New env vars needed, domain changes, Railway config |
| Cloudflare Pages (Web) | Build output changes, domain changes |
| Supabase Database | New tables, migration changes in `packages/cloud-db/` |
| Daemon Config | New config keys in `~/.lens/config.json` |
| Checklist | Any deployment-affecting change |

### Diagrams

| File | What it shows | When to update |
|------|---------------|----------------|
| `docs/architecture.drawio` | System overview (3 layers, components, connections) | New component, route group, or external service |
| `docs/deployment.drawio` | Deployment targets (npm, Railway, CF Pages, external services) | New deploy target, domain change, new external service |

### Version Note

This is the **v0.1.x** architecture. A future v1.x.x may use a different docs structure. When that happens, this skill should be updated accordingly.

## Instructions

### Step 1: Analyze the diff

Look at the changed files above. Map each changed source file to its architecture section using the Section Map table.

Identify **structural changes** — things that affect architecture:

- New/removed files in `apps/*/src/` or `packages/*/src/`
- Route changes (`app.get(`, `app.post(`, `trackRoute(`)
- Schema changes (`sqliteTable(`, `pgTable(`, migration files)
- CLI commands (`.command(`, `.action(`)
- MCP tools (`registerTool(`)
- Config changes (`package.json` scripts, `tsconfig.json`)
- New middleware (`app.use(`)
- New exports from index files
- DB table changes
- Auth/billing flow changes

**Skip non-structural changes:** formatting, lint fixes, comments, test files, dependency bumps, version bumps.

### Step 2: If no structural changes

If none of the changed files contain structural changes:
1. Report: "No structural changes detected — bumping sync hash only."
2. Update the `<!-- doc-sync: ... -->` line in `docs/ARCHITECTURE.md` to the current HEAD hash.
3. Done.

### Step 3: If structural changes exist

1. For each changed source file, identify the target doc + section from the maps above.
2. Read the target doc(s) fully.
3. Read the relevant source files to understand the new state.
4. Run `git diff <sync_hash>..HEAD -- <file>` for specific files if needed.
5. Update **only the affected sections**.
6. If a change adds a new cross-cutting flow, add it under "Data Flows" in ARCHITECTURE.md.
7. If a change affects deployment (new env vars, new deploy target, build changes), update `docs/deployment.md`.
8. Update the `<!-- doc-sync: ... -->` watermark in `docs/ARCHITECTURE.md` to HEAD.

### Step 4: Diagram updates

If structural changes affect a diagram:

- **`docs/architecture.drawio`** — new layer, component, route group, or external service
- **`docs/deployment.drawio`** — new deploy target, domain change, new external service dependency

For each affected diagram:
1. Read the existing `.drawio` file.
2. Use the `/diagram` skill rules: numeric IDs, consistent color palette, 30px margins, edges at back layer.
3. Update only the affected cells — don't rewrite the entire diagram.

## Rules

- Do NOT rewrite unchanged sections.
- Match the existing style: tables, code blocks, same heading levels.
- Keep descriptions concise and technical — no marketing language.
- If a table row needs updating, update just that row.
- If a new table row is needed, add it in the logical position.
- The `<!-- doc-sync: ... -->` watermark at the bottom of `docs/ARCHITECTURE.md` is the canonical sync point.
- Diagram follows `/diagram` skill conventions (see `.claude/skills/diagram/SKILL.md`).
