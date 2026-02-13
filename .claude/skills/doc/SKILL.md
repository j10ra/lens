---
name: doc
description: Update docs/ARCHITECTURE.md based on code changes since last sync
---

# /doc — Update ARCHITECTURE.md

## Current State

**HEAD:** !`git rev-parse HEAD`

**Last sync hash:** !`sed -n 's/.*doc-sync: \([a-f0-9]*\).*/\1/p' docs/ARCHITECTURE.md`

**Changed files since last sync:**
!`SYNC=$(sed -n 's/.*doc-sync: \([a-f0-9]*\).*/\1/p' docs/ARCHITECTURE.md) && if [ -n "$SYNC" ]; then git diff --name-status "$SYNC"..HEAD; else echo "NO SYNC HASH FOUND"; fi`

**Diff summary:**
!`SYNC=$(sed -n 's/.*doc-sync: \([a-f0-9]*\).*/\1/p' docs/ARCHITECTURE.md) && if [ -n "$SYNC" ]; then git diff --stat "$SYNC"..HEAD; else echo "NO SYNC HASH FOUND"; fi`

## Instructions

You are updating `docs/ARCHITECTURE.md` to reflect code changes since the last documented sync.

### Step 1: Analyze the diff

Look at the changed files above. Identify **structural changes** — things that affect the architecture doc:

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
2. Update ONLY the `<!-- doc-sync: ... -->` line at the end of `docs/ARCHITECTURE.md` to the current HEAD hash.
3. Done.

### Step 3: If structural changes exist

1. Read `docs/ARCHITECTURE.md` fully.
2. For each structural change, read the relevant source files to understand the new state.
3. Run `git diff <sync_hash>..HEAD -- <file>` for specific files if needed.
4. Update **only the affected sections** of ARCHITECTURE.md. Preserve all unchanged sections exactly.
5. Update the `<!-- doc-sync: ... -->` watermark at the end of the file to the current HEAD hash.

### Rules

- Do NOT rewrite unchanged sections.
- Do NOT add new top-level sections unless a major new component was added.
- Match the existing style: tables, code blocks, same heading levels.
- Keep descriptions concise and technical — no marketing language.
- If a table row needs updating (e.g., new route, new table), update just that row.
- If a new table row is needed, add it in the logical position.
