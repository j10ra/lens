# RLM — Local Repo Context Daemon

RLM indexes codebases and serves targeted context to Claude Code. Zero LLM calls on the query path — pure retrieval with structural analysis (~240ms).

## Install

### 1. Start the daemon

Requires [Encore.ts](https://encore.dev) and Docker (for Postgres).

```bash
cd /Volumes/Drive/__x/RLM && encore run
```

### 2. Install the CLI

```bash
cd /Volumes/Drive/__x/RLM/packages/rlm-cli
npm install && npm run build && npm link
```

Verify: `rlm --version`

### 3. Set secrets (optional — for embeddings)

```bash
encore secret set --type dev VoyageApiKey   # Voyage AI (semantic search)
```

Embeddings are optional. Core search uses grep; semantic search activates when embeddings are available.

## Integrate with Claude Code

### Step 1: Register your repo

```bash
cd /path/to/your/project
rlm repo register
```

This scans files, extracts metadata (exports, imports, docstrings), analyzes git history, builds the import graph, and starts chunking. Takes ~30s for a 3,000-file repo.

Progress output:
```
  Indexing chunks...         done 14,153 chunks
  Extracting metadata...     done 795 files
  Analyzing git history...   done 1,568 files
  Building import graph...   done 2,449 edges
  Co-change pairs...         done 3,372 pairs

  Ready - run `rlm context "your goal"` to get started
  Background: embeddings 67% — run `rlm status` to check
```

### Step 2: CLAUDE.md (auto-injected)

`rlm repo register` automatically creates/prepends a `CLAUDE.md` in your project with RLM instructions. Claude Code reads it on every turn and follows the retrieval pattern automatically.

Control injection behavior: `rlm config set inject_behavior <once|always|skip>`

### Step 3: Verify

```bash
rlm status          # Index health + embedding coverage
rlm context "auth"  # Should return relevant files with impact analysis
```

## How Context Works

When you run `rlm context "gate in container acceptance"`, RLM:

1. **Keyword-matches** against pre-extracted file metadata (exports, imports, docstrings)
2. **Boosts** recently active files (git commit frequency in last 90 days)
3. **Enriches** with reverse imports ("what breaks if I change this?")
4. **Enriches** with co-change history ("what files always change together?")
5. **Formats** a compact context pack (~200-300 tokens)

Example output:
```
# gate in container acceptance

## Where to Look
1. src/models/container-acceptance.ts
   exports: ContainerAcceptanceItem
2. src/services/acceptance.service.ts
   exports: ContainerControlAcceptanceService

## Impact
container-acceptance.ts <- container-visit.ts
acceptance.service.ts <- acceptance.component.ts, container-control.module.ts

## History
acceptance.service.ts: 14 commits/90d, co-changes: acceptance.component.ts (8x)

## Tools
rlm search "<query>" | rlm read <path> | rlm run "<cmd>"
```

Zero LLM calls. Pure structural retrieval. ~240ms.

## Core Commands

| Command | Purpose |
| --- | --- |
| `rlm context "<goal>"` | Structural context pack — relevant files, impact, git history |
| `rlm search "<query>"` | Hybrid grep + semantic search |
| `rlm read <path>` | Fetch full file content |
| `rlm run "<cmd>"` | Execute commands (npm, cargo, python, git) |
| `rlm status` | Index health, embedding coverage, structural stats |
| `rlm task "<goal>"` | Alias for `rlm context` (backward compat) |

## Repo Management

| Command | Purpose |
| --- | --- |
| `rlm repo register` | Register + index current repo |
| `rlm repo list` | Show all registered repos |
| `rlm repo remove --yes` | Remove repo data |
| `rlm repo watch` | Start file watcher (auto-updates index) |
| `rlm repo unwatch` | Stop file watcher |
| `rlm repo watch-status` | Check watcher state |

## What Gets Indexed

During `rlm repo register`, RLM builds:

| Data | Source | Used by |
| --- | --- | --- |
| Chunks | File content split into ~100-line segments | `rlm search` |
| Metadata | Regex-extracted exports, imports, docstrings | `rlm context` |
| Import graph | Directed edges (source → target) | Impact analysis in `rlm context` |
| Git stats | Commit count, recent activity per file | Activity boost in `rlm context` |
| Co-changes | File pairs that change together in commits | History section in `rlm context` |
| Embeddings | Voyage AI `voyage-code-3` (background, optional) | Semantic search in `rlm search` |

## How It Works

- **Auto-indexes** on register, then tracks git changes + file watcher
- **Semantic search** available when embeddings ready (check `rlm status`)
- **Background worker** refreshes stale repos every 5 minutes
- **File watcher** picks up saves in real-time (~500ms debounce)
- **Per-repo isolation** — chunks, embeddings, metadata all separate

### File Watcher

- Auto-started on `rlm repo register`
- Debounces changes (500ms), skips binary/node_modules/.git
- New chunks get `embedding = NULL` (background worker picks them up)
- **In-memory** — stops on daemon restart, re-enable with `rlm repo watch`

## Updating

| What changed | Action |
| --- | --- |
| CLI code (`packages/rlm-cli/`) | `cd packages/rlm-cli && npm run build` |
| Daemon code (services) | Kill and re-run `encore run` |
| SQL migrations | Kill and re-run `encore run` |

After daemon restart: `rlm repo watch` to restore file watchers.

## Troubleshooting

**Daemon not responding:** `cd /Volumes/Drive/__x/RLM && encore run`

**Repo not found:** `rlm repo register && rlm status`

**Search returns empty:** `rlm index --force && rlm status`

**File watcher not active:** `rlm repo watch && rlm repo watch-status`

## Development

For architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md).
