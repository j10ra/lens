Now I have all the information needed. Here's the complete mapping:

---

## Indexing Pipeline Overview

### Core Index (`runIndex` in `packages/engine/src/index/engine.ts:36`)

Always runs when triggered. Stages:

| Stage | Function | What it does |
|-------|----------|--------------|
| **1. Discovery** | `diffScan()` or `fullScan()` | Finds changed files (diff) or all files (full/force). Skips if `last_indexed_commit === headCommit`. |
| **2. Chunking** | `chunkFile()` | Splits files into chunks, upserts/deletes chunks with hash-based dedup. Max 100k chunks/repo. |
| **3. Metadata Extraction** | `extractAndPersistMetadata()` | Extracts exports, imports, docstrings, sections, internals from chunks. |
| **4. Import Graph** | `buildAndPersistImportGraph()` + `computeMaxImportDepth()` | Builds directed import edges, computes BFS depth from leaves. |
| **5. Git Analysis** | `analyzeGitHistory()` | Commit counts, co-change pairs, file activity stats. |

---

### Enrichment (Post-Index, in `apps/daemon/src/server.ts`)

Runs **after** core index completes, only if:
- Repo feature toggle is **enabled** (`enable_*`)
- Quota **not exceeded** (`quotaRemaining() > 0`)
- Capabilities **available** (`caps?.embedTexts`, etc.)

| Enrichment | Function | What it does |
|------------|----------|--------------|
| **Vocab Clusters** | `buildVocabClusters()` | Voyage-embeds terms, clusters by cosine >0.75. |
| **Embeddings** | `ensureEmbedded()` | Voyage vector embeddings for semantic search. |
| **Purpose** | `enrichPurpose()` | LLM-generated file purpose summaries. |

---

### Trigger Matrix

| Trigger | Core Index | Enrichment |
|---------|------------|------------|
| `lens repo register` / `POST /repo/register` | full scan | ✅ yes |
| `lens index` / `POST /index/run` | diff scan (or full if `--force`) | ✅ yes |
| `lens context` / `POST /context` | diff scan via `ensureIndexed()` only if HEAD changed | ❌ **no** |
| File watcher (chokidar) | diff scan via `runIndex()` | ❌ **no** |

---

### Why the Split?

- **Core** = fast, local, no external APIs (SQLite + git only)
- **Enrichment** = slow, expensive API calls (Voyage embeddings, LLM summaries)
- Context queries (`lens context`) skip enrichment to keep latency low (~10ms cached, ~0.5-7s cold)
- Only explicit user actions (`register`, `index`) trigger the expensive enrichment

---

## Report

- **Tool calls**: 2
- **Files read**: 2
- **Key findings**:
  - Core index has 5 stages: discovery → chunking → metadata → import graph → git analysis
  - Enrichment has 3 stages: vocab clusters → embeddings → purpose (all require external APIs + quota)
  - `lens context` triggers diff-scan-only indexing (via `ensureIndexed`) but NEVER runs enrichment
  - File watchers run core index but skip enrichment to avoid API costs on every save
