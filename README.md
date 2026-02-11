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

## Daemon & Dashboard

The daemon runs on port 4111 — serves the REST API, MCP stdio, and a full local dashboard. Manage repos, watch indexing jobs, build context packs, and browse indexed data from the browser.

```sh
lens daemon start
lens dashboard          # opens http://localhost:4111/dashboard/
```

Dashboard pages: **Overview** (system stats, repo cards), **Context** (interactive query builder), **Repositories** (status table), **Jobs** (indexing progress), **Requests** (live log), **Data Browser**, **Usage**, **Billing**.

```sh
# REST API
curl http://localhost:4111/context \
  -H "Content-Type: application/json" \
  -d '{"goal": "add auth middleware"}'
```

## MCP Integration

`lens repo register` writes `.mcp.json` automatically. Claude Code, Cursor, and any MCP-compatible agent auto-discovers LENS. To re-create it manually: `lens repo mcp`.

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

LENS is free for local use — TF-IDF, import graph, co-change, and caching all work without an account. Pro unlocks two additional pipeline stages that improve retrieval accuracy for larger or more complex codebases.

### Semantic Embeddings

Every file chunk is embedded for semantic search. LENS runs cosine similarity against all vectors to find files that are semantically relevant — even when they share zero keywords with your prompt.

> **Example:** Query `"handle expired sessions"` surfaces `tokenRefresh.ts` and `authMiddleware.ts`. Neither contains the word "session".

### Vocab Clusters

Export names across your repo are embedded and clustered by cosine similarity (threshold >0.75). When a query matches one term in a cluster, all related terms are pulled in — automatic query expansion tuned to your codebase.

> **Example:** Query `"auth"` expands to `verifyToken`, `sessionMiddleware`, `loginHandler`, `requireAuth`.

Together they add ~100-300ms per query. After logging in, run `lens index --force` to embed everything immediately, or leave it — LENS embeds new and changed files on each incremental index, so coverage grows automatically as you work.

```sh
lens login --github
# Authenticated as user@example.com

lens status
# Pro: active
# Embeddings: 847/847 files
# Vocab clusters: 42 clusters

# Optional: force full re-index to embed everything now
lens index --force
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
| `lens repo mcp` | Write .mcp.json for agent integration |
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
