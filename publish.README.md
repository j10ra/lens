# lens-engine

**Code is a graph. Query the structure.**

LENS is a local-first code intelligence engine for AI agents. Import graph traversal, co-change analysis, hub detection, TF-IDF scoring — ranked results in one call via MCP or CLI. No API keys, no cloud, fully deterministic.

## Install

```bash
npm install -g lens-engine
```

Requires Node.js 20+.

## Quick Start

```bash
# Start the daemon
lens daemon start

# Register and index a repo
lens register .

# Search with pipe-separated terms
lens grep "auth|middleware|session"
```

## MCP Integration

LENS exposes MCP tools via HTTP Streamable transport. `lens register` automatically creates `.mcp.json` in your repo:

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

### MCP Tools

| Tool | Description |
|------|-------------|
| `lens_grep` | Ranked code search — pipe-separated terms, relevance scores, symbols, importers, co-change partners |
| `lens_graph` | Dependency map — cluster or directory level with import edges and hub files |
| `lens_graph_neighbors` | File neighborhood — imports, importers, co-change partners for a single file |
| `lens_reindex` | Trigger a reindex of a registered repo |

## How It Works

1. **TF-IDF Scoring** — Tokenizes content, paths, exports, docstrings with code-domain stopwords
2. **Concept Expansion** — Static synonyms + repo-specific vocab expand queries
3. **Import Graph** — Directed graph of every import/require. Hub files get boosted
4. **Git Co-Change** — Files that change together get surfaced together
5. **Cache** — Auto-reindex on git HEAD change. Sub-second cold queries

## CLI Reference

| Command | Description |
|---------|-------------|
| `lens daemon start` | Start the HTTP daemon on :4111 |
| `lens daemon stop` | Stop the running daemon |
| `lens status` | Show daemon version, status, uptime |
| `lens register <path>` | Register a repo and trigger full index |
| `lens list` | List all registered repos |
| `lens remove <id>` | Remove a registered repo |
| `lens grep "<query>"` | Ranked search with pipe-separated terms |
| `lens graph` | Cluster-level dependency graph |
| `lens graph <dir>` | Directory-level file graph |
| `lens graph --file <path>` | Single file neighborhood |

## Agent Instruction Injection

`lens register` automatically injects LENS instructions into agent config files found in your repo (CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules, .clinerules, .roorules, .github/copilot-instructions.md). Use `--no-inject` to skip.

## Dashboard

The daemon serves a local dashboard at `http://localhost:4111` — trace viewer, repo explorer, graph visualization.

## Links

- [Documentation](https://lens-engine.com/docs)
- [GitHub](https://github.com/j10ra/lens)
- [Benchmarks](https://github.com/j10ra/lens/tree/main/bench)

## License

MIT
