# RLM — Local Repo Context Daemon

RLM indexes codebases and serves targeted context packs to Claude Code. TF-IDF keyword scoring + Voyage semantic boost + OpenRouter file summaries + structural enrichment (~150ms cold, ~10ms cached).

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

### 3. Set secrets (optional)

```bash
encore secret set --type dev VoyageApiKey      # Voyage AI embeddings + vocab clusters
encore secret set --type dev OpenRouterApiKey   # LLM purpose summaries
```

Without secrets: core keyword search + static concept synonyms still work. With Voyage: semantic vector search + vocab clusters. With OpenRouter: LLM file summaries enrich keyword scoring.

## Integrate with Claude Code

### Step 1: Register your repo

```bash
cd /path/to/your/project
rlm repo register
```

Scans files, extracts metadata (exports, imports, docstrings), builds vocab clusters (Voyage), constructs import graph, analyzes git history. Embeddings + OpenRouter file summaries run in parallel after indexing. ~30-50s for a 3,000-file repo.

### Step 2: CLAUDE.md (auto-injected)

`rlm repo register` automatically creates/prepends a `CLAUDE.md` in your project with RLM instructions. Claude Code reads it on every turn and follows the retrieval pattern automatically.

Control injection: `rlm config set inject_behavior <once|always|skip>`

### Step 3: Verify

```bash
rlm status                              # Index health + embedding coverage
rlm context "gate in container acceptance"  # Context pack
```

## How Context Works

`rlm context "gate in container acceptance"` triggers:

1. **Auto-index** if HEAD has changed (diff scan, no re-index if up-to-date)
2. **Keyword scoring** — TF-IDF weighted match against file metadata (exports, docstrings, LLM purpose summaries, path tokens). Code-domain stopwords filtered. Indegree boost for hub files, sibling dedup, dynamic file cap based on repo complexity
3. **Concept expansion** — static synonyms (error→interceptor/middleware) + repo-specific vocab clusters (Voyage-embedded export terms clustered by cosine similarity)
4. **Co-change promotion** — direct partners of top keyword files + cluster-based promotion from structural data
5. **Semantic boost** — Voyage vector search merges high-similarity chunks into results (when embeddings available)
6. **Structural enrichment** — forward/reverse imports, 2-hop dependency chains, co-change clusters, git activity
7. **Cache** — keyed by (repo, goal, commit), 120s TTL, 20 entries

Output:
```
# gate in container acceptance

## Files
1. src/models/container-acceptance.ts — exports: ContainerAcceptanceItem
2. src/services/acceptance.service.ts — exports: ContainerControlAcceptanceService

## Dependency Graph
container-acceptance.ts → container-visit.ts (imports)
acceptance.service.ts ← acceptance.component.ts, container-control.module.ts (imported by)

## Co-change Clusters
[acceptance.service.ts, acceptance.component.ts, container-control.module.ts] — 8 co-commits

## Activity
acceptance.service.ts: 14 commits, 3/90d, last: 2d ago
```

Zero LLM calls at query time. ~0.5-7s cold (4400-file repo), ~10ms cached.

### Performance: RLM vs Manual Grep

Tested on a 4400-file C#/TypeScript codebase with realistic bug report queries:

| Approach | Time | Files | Quality |
| --- | --- | --- | --- |
| **With RLM** | 0.5-7s | 12-15 ranked | Scored, deps, co-changes, activity |
| **Without RLM** (grep) | 10-30 min | 100s unranked | Raw file list, no structure |

100-200x faster with ranked, structurally enriched results.

## CLI Commands

| Command | Purpose |
| --- | --- |
| `rlm context "<goal>"` | Context pack — relevant files, deps, co-changes, activity |
| `rlm status` | Index health, embedding coverage |
| `rlm index` | Diff scan — re-chunks only changed files since last index |
| `rlm index --force` | Full scan — re-chunks every file from scratch |

### Repo Management

| Command | Purpose |
| --- | --- |
| `rlm repo register` | Register + index current repo |
| `rlm repo list` | Show all registered repos |
| `rlm repo remove --yes` | Remove repo data |
| `rlm repo watch` | Start file watcher (auto-reindex on save) |
| `rlm repo unwatch` | Stop file watcher |
| `rlm repo watch-status` | Check watcher state |

### Config

| Command | Purpose |
| --- | --- |
| `rlm config get <key>` | Get config value |
| `rlm config set <key> <value>` | Set config value |
| `rlm daemon stats` | Global daemon statistics |

## What Gets Indexed

| Data | Source | Used by |
| --- | --- | --- |
| Chunks | File content split into ~100-line segments | Vector search (semantic boost) |
| Metadata | Regex-extracted exports, imports, docstrings | TF-IDF keyword scoring |
| Purpose summaries | OpenRouter API (configurable model) per code file | TF-IDF keyword scoring (supplements docstrings) |
| Vocab clusters | Voyage-embedded export terms, cosine-clustered | Concept expansion at query time |
| Import graph | Directed edges (source → target) | Dependency graph in context pack |
| Git stats | Commit count, recent activity per file | Activity boost + activity section |
| Co-changes | File pairs that change together in commits | Co-change clusters in context pack |
| Embeddings | Voyage AI `voyage-code-3` (background, optional) | Semantic vector search |

## How It Works

- **Auto-indexes** on register, re-indexes when HEAD changes (diff-aware)
- **Vocab clusters** built at index time — Voyage embeds unique export terms, clusters by cosine > 0.75, stored as JSONB
- **Semantic search** activates when embeddings are ready (check `rlm status`)
- **Purpose summaries** — OpenRouter API generates 1-sentence file descriptions for code files using exports + docstring + first chunk as context. Fills gaps where regex docstrings are missing. Model configurable in `index/lib/models.ts` (currently `qwen/qwen3-coder-next`)
- **Background worker** refreshes stale repos every 5 minutes (embeddings + purpose summaries)
- **File watcher** picks up saves in real-time (~500ms debounce)
- **Per-repo isolation** — chunks, embeddings, metadata, clusters all separate

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

**Stale index:** `rlm index --force && rlm status`

**File watcher not active:** `rlm repo watch && rlm repo watch-status`

## Development

For architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md).
