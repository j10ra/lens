# RLM — Local Repo Context Daemon

RLM is a local repo context daemon that indexes code, creates embeddings, and serves targeted context to Claude Code via CLI commands.

## Install

### 1. Start the daemon

Requires [Encore.ts](https://encore.dev) and Docker (for Postgres).

```bash
cd /Volumes/Drive/__x/RLM && encore run
```

### 2. Install the CLI

```bash
cd /Volumes/Drive/__x/RLM/packages/rlm-cli
npm install && npm run build
npm link
```

This makes `rlm` available globally. Verify:

```bash
rlm --version
rlm daemon stats
```

> **Updating the CLI** after code changes: `cd packages/rlm-cli && npm run build`
> No need to re-link — `npm link` points to `dist/` directly.

## Quick Start

### 1. Register your repo

```bash
cd /path/to/your/project
rlm repo register
```

This auto-indexes your repo, creates embeddings, and starts a file watcher.

### 2. Verify status

```bash
rlm status
```

### 3. Add CLAUDE.md (optional but recommended)

Create `.claude/CLAUDE.md` in your project with RLM instructions so Claude Code knows about these commands.

## Core Commands

- `rlm task "<goal>"` — Get context pack with repo map, relevant files, recent activity
- `rlm search "<query>"` — Find code patterns, function definitions, usage examples
- `rlm read <path>` — Fetch full file content (use after search)
- `rlm run "<command>"` — Execute tests/builds (sandboxed: npm, cargo, python, git)
- `rlm status` — Check index freshness and embedding coverage

## Multi-Repo Management

- `rlm repo list` — Show all registered repos with stats
- `rlm repo register` — Register current repo
- `rlm repo remove --yes` — Remove this repo's data
- `rlm repo watch` — Start watching for file changes (auto-updates index)
- `rlm repo unwatch` — Stop file watcher
- `rlm repo watch-status` — Check watcher state

## How It Works

- **Auto-indexes** on register, then tracks git changes + file watcher
- **Semantic search** available when embeddings ready (~100% status)
- **Background worker** refreshes stale repos every 5 minutes
- **File watcher** picks up saves in real-time (~500ms debounce)
- **Per-repo isolation** — chunks, embeddings, traces all separate

### File Watcher

The file watcher uses chokidar to monitor your repo for changes in real-time:

- Auto-started on first `rlm repo register`
- Debounces changes (500ms) to avoid thrashing
- Skips binary files, node_modules, .git, dist, build directories
- Updates chunks immediately — no need to re-index
- New chunks get `embedding = NULL` (background worker picks them up)

**Limitations:**

- Watchers are in-memory — stop when daemon restarts
- Re-enable with `rlm repo watch` after daemon restart
- Only watches files < 500KB

## Integration with Claude Code

Add a `.claude/CLAUDE.md` file to any project with RLM instructions:

```markdown
## RLM — Repo Context Daemon

This project is indexed by RLM. When making changes:

### Core Commands

- `rlm task "<goal>"` — Get context pack with repo map, relevant files, recent activity
- `rlm search "<query>"` — Find code patterns, function definitions, usage examples
- `rlm read <path>` — Fetch full file content (use after search)
- `rlm run "<command>"` — Execute tests/builds (sandboxed: npm, cargo, python, git)
- `rlm status` — Check index freshness and embedding coverage
```

Claude Code will read these instructions and invoke `rlm` commands via Bash when appropriate.

## Example Workflow

```bash
# You: "Fix the failing auth tests"
# Claude: Runs `rlm task "fix failing auth tests"` → gets relevant files
#          Runs `rlm search "auth test"` → finds test files
#          Reads files with `rlm read`
#          Makes changes
#          Runs `rlm run "npm test"` to verify
```

## Troubleshooting

**Daemon not responding:**

```bash
cd /Volumes/Drive/__x/RLM && encore run
```

**Repo not found:**

```bash
rlm repo register
rlm status
```

**Search returns empty:**

```bash
rlm index --force
rlm status
```

**File watcher not active after restart:**

```bash
rlm repo watch
rlm repo watch-status
```

**Check all repos:**

```bash
rlm repo list
```

## Development

For detailed architecture and data flow information, see [ARCHITECTURE.md](ARCHITECTURE.md).
