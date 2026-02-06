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

### Updating after changes

| What changed                      | Action                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| CLI code (`packages/rlm-cli/`)    | `cd packages/rlm-cli && npm run build` — next `rlm` call picks it up, no re-link needed |
| Daemon code (services, endpoints) | Kill and re-run `encore run`, then `rlm repo watch` per repo to restore file watchers   |
| New SQL migrations                | Kill and re-run `encore run`, then `rlm repo watch` per repo                            |

> File watchers run inside the daemon (in-memory). Any daemon restart kills them — re-enable with `rlm repo watch`.

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

### 3. Add CLAUDE.md (critical for best results)

Create `.claude/CLAUDE.md` in your project:

```markdown
## RLM — Repo Context Daemon

This project is indexed by RLM. Use **retrieval-led reasoning** for all tasks.

### IMPORTANT: Explore first, then retrieve

Before writing code, build a mental model:

1. `rlm task "<goal>"` — Get compressed orientation (repo map, relevant files, recent traces)
2. `rlm search "<keyword>"` — Find specific code patterns
3. `rlm read <path>` — Fetch full files before editing
4. `rlm run "<command>"` — Verify changes

## Why this works

Passive context (this file) + compressed orientation (`rlm task`) + targeted retrieval (`rlm read`)
achieved 100% pass rate in Vercel's evals, while skills maxed at 79%. Build your mental model first.
```

## Core Commands

| Command                | Purpose                                                   |
| ---------------------- | --------------------------------------------------------- |
| `rlm task "<goal>"`    | Compressed context pack — repo map, top-k files, traces   |
| `rlm search "<query>"` | Hybrid semantic + text search                             |
| `rlm read <path>`      | Fetch full file (use after search)                        |
| `rlm run "<command>"`  | Execute tests/builds (sandboxed: npm, cargo, python, git) |
| `rlm status`           | Index freshness, embedding coverage                       |

## Multi-Repo Management

| Command                 | Purpose                                 |
| ----------------------- | --------------------------------------- |
| `rlm repo list`         | Show all registered repos with stats    |
| `rlm repo register`     | Register current repo                   |
| `rlm repo remove --yes` | Remove this repo's data                 |
| `rlm repo watch`        | Start file watcher (auto-updates index) |
| `rlm repo unwatch`      | Stop file watcher                       |
| `rlm repo watch-status` | Check watcher state                     |

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

The `CLAUDE.md` template above is all you need. Claude Code reads it on every turn and follows the retrieval-led pattern automatically.

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
