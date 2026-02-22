# LENS

**Code is a graph. Query the structure.**

LENS is an open-source code intelligence engine that indexes your codebase locally and serves structural context to AI agents via MCP or CLI. Import graph traversal, co-change analysis, hub detection, TF-IDF scoring — ranked results in one call. No API keys, no cloud, fully deterministic.

Currently supports TypeScript/JavaScript with a pluggable parser architecture for adding more languages.

## Install

Requires Node.js 20+.

```bash
npm install -g lens-engine
```

## Quick Start

```bash
# Start the daemon
lens daemon start

# Register and index a repo
lens register .

# Search with pipe-separated terms
lens grep "auth|middleware|session"
```

`lens register` handles everything — TF-IDF indexing, import graph construction, git history analysis — in one pass.

## MCP Integration

LENS exposes MCP tools via HTTP Streamable transport. Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "lens": {
      "type": "http",
      "url": "http://localhost:4111/mcp"
    }
  }
}
```

`lens register` creates this automatically. Claude Code, Cursor, and any MCP-compatible agent will discover and call LENS tools.

### MCP Tools

| Tool | Description |
|------|-------------|
| `lens_grep` | Ranked code search — pipe-separated terms, per-file relevance score, symbols, importers, co-change partners |
| `lens_graph` | Dependency map — cluster-level overview or directory-level drill-down with import edges and hub files |
| `lens_graph_neighbors` | File neighborhood — imports, importers, and co-change partners for a single file |
| `lens_reindex` | Trigger a reindex of a registered repo |

## How It Works

Every search query runs through a multi-stage pipeline:

1. **Diff Scan** — Detects changed files since last index. Incremental after first run.
2. **TF-IDF Scoring** — Tokenizes content, paths, exports, docstrings. Code-domain stopwords filter noise.
3. **Concept Expansion** — Static synonyms + repo-specific vocab expand queries. "auth" matches `verifyToken`, `sessionMiddleware`.
4. **Import Graph** — Directed graph of every import/require. Hub files (imported by many) get boosted.
5. **Git Co-Change** — Files that change together get surfaced together. Catches cross-cutting concerns grep misses.
6. **Cache** — Auto-reindex on git HEAD change. Sub-second cold queries.

## CLI Reference

| Command | Description |
|---------|-------------|
| `lens daemon start` | Start the HTTP daemon on :4111 |
| `lens daemon start -f` | Start daemon in foreground |
| `lens daemon stop` | Stop the running daemon |
| `lens dashboard` | Open the dashboard in your browser |
| `lens status` | Show daemon version, status, uptime |
| `lens register <path>` | Register a repo and trigger full index |
| `lens register <path> --no-inject` | Register without injecting agent instructions |
| `lens list` | List all registered repos with index status |
| `lens remove <id>` | Remove a registered repo |
| `lens grep "<query>"` | Ranked search with pipe-separated terms |
| `lens graph` | Cluster-level dependency graph overview |
| `lens graph <dir>` | Directory-level file graph |
| `lens graph --file <path>` | Single file neighborhood |

## Agent Instruction Injection

`lens register` automatically injects LENS instructions into agent configuration files found in your repo:

- `CLAUDE.md` — Claude Code
- `AGENTS.md` — Codex, Zed, JetBrains, Factory, Jules
- `.github/copilot-instructions.md` — GitHub Copilot
- `.cursorrules` — Cursor
- `.windsurfrules` — Windsurf
- `.clinerules` — Cline
- `.roorules` — Roo Code

If no instruction files exist, creates `CLAUDE.md` and `AGENTS.md`. Idempotent — skips files already containing LENS instructions. Use `--no-inject` to opt out.

## Dashboard

The daemon serves a local dashboard at `http://localhost:4111` with:

- Trace waterfall viewer — every query produces spans visible in the dashboard
- Repo explorer — browse indexed files, metadata, import graphs
- Graph visualization — interactive dependency maps

## Architecture

```
packages/
  core/       ← Framework primitives: lensFn, lensRoute, Logger, TraceStore
  engine/     ← Code intelligence: indexing, scoring, graphs, co-change, hubs
  cli/        ← Thin CLI shell, calls daemon HTTP API
apps/
  daemon/     ← Hono HTTP server :4111, MCP stdio, serves dashboard
  dashboard/  ← Vite + React SPA: trace viewer, repo explorer, graph viz
  web/        ← Landing site and documentation
```

MCP and CLI are gates — both call daemon HTTP routes. All logic flows through daemon for unified observability.

## Benchmarks

Controlled A/B benchmarks across repos (32–2000+ files):

- **+15.8pp accuracy on unfamiliar repos** — structural context helps most when agents don't know where to start
- **Sub-second queries** — full pipeline runs entirely local
- **Co-change catches what grep misses** — git history surfaces cross-cutting concerns
- **Value scales with unfamiliarity** — on repos you work in daily, built-in grep is often sufficient

Full benchmark data in [`bench/`](bench/).

## License

MIT
