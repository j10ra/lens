Boss, I've traced the complete context pack generation pipeline. Here's the full flow:

## Context Pack Pipeline — POST /context → Response

### Entry Point
**`apps/daemon/src/server.ts:432-444`** — Hono route handler
```ts
app.post("/context", async (c) => {
  const { repo_id, goal } = await c.req.json();
  const result = await buildContext(db, repo_id, goal, caps, c.get("trace"), { useEmbeddings });
  return c.json(result);
});
```

---

### Stage 1: Auto-Index
**`packages/engine/src/context/context.ts:72-74`** → **`packages/engine/src/index/engine.ts:239-247`**
- `ensureIndexed()` checks if HEAD commit changed
- If stale, runs `runIndex()` (diff scan or full scan)
- **File**: `packages/engine/src/index/engine.ts:36-196`
  - Discovery: `diffScan()` or `fullScan()` from `discovery.ts`
  - Chunking: `chunkFile()` from `chunker.ts`
  - Metadata extraction: `extractAndPersistMetadata()` from `extract-metadata.ts`
  - Import graph: `buildAndPersistImportGraph()` from `import-graph.ts`
  - Git history: `analyzeGitHistory()` from `git-analysis.ts`

---

### Stage 2: Cache Check
**`packages/engine/src/context/context.ts:76-92`**
- In-memory LRU cache (120s TTL, 20 entries)
- Cache key: `${repoId}:${commit}:${embedEnabled}:${goal}`
- Cache hit returns immediately with `cached: true`

---

### Stage 3: Query Parsing
**`packages/engine/src/context/context.ts:96`** → **`packages/engine/src/context/input-parser.ts:147-173`**
- Detects query kind: `stack_trace` | `error_message` | `symbol` | `natural`
- Extracts: stack frames, symbols, error tokens, natural language tokens
- Uses regex patterns for JS/TS, Python, C#/Java stack frames

---

### Stage 4: Load Structural Data
**`packages/engine/src/context/context.ts:98-104`** → **`packages/engine/src/context/structural.ts`**
- `loadFileMetadata()` — exports, docstrings, sections, internals, purpose
- `getAllFileStats()` — commit counts, recent activity
- `loadVocabClusters()` — Voyage-embedded term clusters
- `getIndegrees()` — import dependency counts

---

### Stage 5: Vector Search (Pro)
**`packages/engine/src/context/context.ts:106-108`** → **`packages/engine/src/context/vector.ts:20-51`**
- Only if embeddings available + Pro plan
- Embeds query via Voyage API (`caps.embedTexts`)
- Cosine similarity search against all embedded chunks
- Returns top 10 semantic matches

---

### Stage 6: TF-IDF Scoring + Interpretation
**`packages/engine/src/context/context.ts:114-124`** → **`packages/engine/src/context/query-interpreter.ts:296-490`**
- `interpretQuery()` scores files using:
  - **Exact match**: path tokens (4x), exports (2.5x), docstring/purpose (1x), internals (1.5x)
  - **Expanded terms**: synonyms + vocab clusters (0.5x weight)
  - **Stemmed terms**: suffix-stripped matches
  - **Query-kind boosts**: stack frames (+50), symbol export (+100), error token (+30-40)
  - **Hub dampening**: penalize files with >5 exports
  - **Recent git activity bonus**: +0.5 per recent commit (max 5)
  - **Cluster boost**: 1.3x if in vocab cluster
  - **Import hub boost**: 1 + log₂(indegree) * 0.1

---

### Stage 7: Error Content Search
**`packages/engine/src/context/context.ts:127-156`**
- For `error_message` queries only
- Full-text search in chunk content via `chunkQueries.searchContent()`
- Boosts scores +40, adds up to 3 files

---

### Stage 8: Co-change Promotion
**`packages/engine/src/context/context.ts:158-174`** → **`packages/engine/src/context/structural.ts:74-82`**
- Looks up git co-change partners for top 5 files
- Promotes up to 3 partners (min 5 co-change count)
- Excludes noise paths

---

### Stage 9: Semantic Merge
**`packages/engine/src/context/context.ts:177-209`**
- Merges vector search results with TF-IDF results
- Adds up to 5 semantic-only files (not already ranked)
- Extracts signature line as reason

---

### Stage 10: Structural Enrichment
**`packages/engine/src/context/context.ts:214-253`** → **`packages/engine/src/context/structural.ts`**
- `getReverseImports()` — who imports these files
- `getForwardImports()` — what these files import
- `get2HopReverseDeps()` — 2-hop caller chains
- `getCochanges()` — co-change partners for clustering
- **Co-change clustering**: groups files by co-change edges, promotes cluster members (count ≥5)

---

### Stage 11: Snippet Resolution
**`packages/engine/src/context/context.ts:256-265`** → **`packages/engine/src/context/snippet.ts:52-127`**
- `resolveSnippets()` for top 5 files:
  1. Stack frame match → line number from parsed frames
  2. Symbol match → find definition line via regex
  3. Best export → pick export matching query tokens
  4. Fallback → no line
- `discoverTestFiles()` — finds related test files via import/co-change heuristics

---

### Stage 12: Context Slicing
**`packages/engine/src/context/context.ts:267-270`** → **`packages/engine/src/context/slicer.ts:36-75`**
- `sliceContext()` extracts ±10 lines around resolved line numbers
- Limits: 1 slice for symbol/error, 2 for stack_trace, 3 for natural
- Returns `CodeSlice` with actual code

---

### Stage 13: Format Context Pack
**`packages/engine/src/context/context.ts:272-289`** → **`packages/engine/src/context/formatter.ts:410-434`**
- `formatContextPack()` picks template by query kind:
  - `formatNatural()` — numbered list, exports, imports, co-changes, tests
  - `formatSymbol()` — definition, dependents, co-changes
  - `formatError()` — error source, references
  - `formatStackTrace()` — crash point, call chain, related
- **Progressive stripping** (2000 token cap):
  1. Strip code slices
  2. Truncate co-change lists
  3. Drop test section
  4. Truncate import arrows
  5. Reduce to top 5 files
  6. Drop purpose summaries

---

### Response
**`packages/engine/src/context/context.ts:291-319`**
```ts
{
  context_pack: string,      // Markdown-formatted context
  stats: {
    files_in_context: number,
    index_fresh: boolean,
    duration_ms: number,
    cached: boolean
  },
  ranked_files?: [...],      // Optional debug info
  query_kind?: QueryKind     // Optional debug info
}
```

---

## Report

- **Tool calls**: 11
- **Files read**: 11
- **Key findings**:
  - Pipeline has 13 stages: auto-index → cache → parse → load → vector → TF-IDF → error search → co-change → semantic merge → structural → snippet → slice → format
  - Core scoring in `query-interpreter.ts` uses TF-IDF with query-kind-specific boosts (symbol +100, stack frame +50, error +30-40)
  - Context slicing (`slicer.ts`) extracts ±10 lines around resolved symbols — Phase 3 feature
  - Progressive stripping ensures output stays under 2000 tokens by dropping code, tests, imports, purpose in order
