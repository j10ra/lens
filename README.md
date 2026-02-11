# LENS

Local-first repo context engine for AI agents.

LENS indexes your codebase — TF-IDF scoring, import graph traversal, co-change analysis — and delivers ranked files in one call. Fewer tokens wasted, smarter output.

## Install

```sh
npm install -g lens-engine
```

Requires Node.js 20+.

## Quick Start

```sh
# Start the background daemon
lens daemon start

# Register and auto-index a repo
cd my-project
lens repo register

# Query with intent
lens context "add auth middleware"
```

```
Context pack: 12 files, 3.2KB
  src/middleware/auth.ts
  src/routes/login.ts
  src/lib/tokens.ts
  ...
```

## What It Does

1. **Diff scan** — detects changed files since last index
2. **TF-IDF keyword scoring** — code-domain stopwords, path tokens, exports, docstrings
3. **Concept expansion** — static synonyms + repo-specific vocab clusters
4. **Import graph traversal** — 2-hop dependency analysis, hub-file boosting
5. **Git co-change analysis** — files that change together get surfaced together
6. **Semantic boost** (Pro) — Voyage vector search for meaning-level matching
7. **Cache** — ~10ms cached, under 1s cold

Your code never leaves your machine. No cloud dependency for local usage.

## Daemon

Runs on port 4111. Serves the REST API, MCP stdio, and local dashboard.

```sh
lens daemon start
lens dashboard

# REST API
curl http://localhost:4111/context \
  -H "Content-Type: application/json" \
  -d '{"goal": "add auth middleware"}'
```

## MCP Integration

Add `.mcp.json` to your project root. Claude Code, Cursor, and any MCP-compatible agent auto-discovers LENS:

```json
{
  "mcpServers": {
    "lens": {
      "command": "lens-daemon",
      "args": ["--stdio"]
    }
  }
}
```

## Pro

Authenticate to unlock Voyage semantic embeddings, purpose summaries, and vocab clusters. Adds ~100-300ms for semantic vector search on top of the base retrieval.

```sh
lens login
lens status
# Pro: active
# Embeddings: 847/847 files
# Vocab clusters: 42 clusters
```

## CLI Reference

All commands support `--json` for machine-readable output.

| Command | Description |
|---------|-------------|
| `lens daemon start` | Start the HTTP daemon on :4111 |
| `lens daemon stop` | Stop the running daemon |
| `lens daemon stats` | Show global statistics |
| `lens repo register` | Register current repo for indexing |
| `lens repo list` | List registered repos |
| `lens repo remove` | Remove current repo |
| `lens repo watch` | Start file watcher for current repo |
| `lens repo unwatch` | Stop file watcher for current repo |
| `lens repo watch-status` | Show watcher status |
| `lens index` | Index the current repo |
| `lens context "<goal>"` | Build a context pack for a goal |
| `lens status` | Show repo index/embedding status |
| `lens dashboard` | Open local dashboard in browser |
| `lens login` | Authenticate via OAuth (GitHub/Google) |
| `lens logout` | Clear cloud authentication |
| `lens config get <key>` | Get a config value |
| `lens config set <key> <val>` | Set a config value |

## License

MIT
