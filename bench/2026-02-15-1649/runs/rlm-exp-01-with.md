Now I have a complete picture of the context pack generation pipeline. Let me summarize.

## Full Context Pack Generation Pipeline

The pipeline flows from `POST /context` → `buildContext()` → `formatContextPack()` → response.

---

### **Stage 1: HTTP Handler** (`apps/daemon/src/server.ts:431-444`)
- Extracts `repo_id` + `goal` from request body
- Checks repo's `enable_embeddings` flag
- Calls `buildContext()` with trace + capabilities

---

### **Stage 2: Index Freshness** (`packages/engine/src/context/context.ts:72-74`)
- Calls `ensureIndexed()` → runs diff scan if HEAD changed
- Does NOT trigger enrichment (embeddings/purpose) — only core index

---

### **Stage 3: Cache Check** (`packages/engine/src/context/context.ts:76-92`)
- Builds cache key: `${repoId}:${commit}:${emb?}:${goal}`
- 120s TTL, max 20 entries, LRU eviction
- Returns cached response on hit (tracks `cache_hit: true`)

---

### **Stage 4: Query Parsing** (`packages/engine/src/context/input-parser.ts:147-173`)
`parseQuery(goal)` classifies the query into:
1. **stack_trace** — 2+ stack frames detected (JS/Python/C# patterns)
2. **symbol** — single CamelCase identifier (e.g., `buildContext`)
3. **error_message** — error codes/suffixes (e.g., `TypeError`, `ECONNREFUSED`)
4. **natural** — fallback for general queries

---

### **Stage 5: Structural Data Loading** (`packages/engine/src/context/context.ts:98-104` + `structural.ts`)
Loads in one batch:
- `loadFileMetadata()` — path, exports, docstring, purpose, sections, internals
- `getAllFileStats()` — commit_count, recent_count per file
- `loadVocabClusters()` — Voyage-embedded term clusters (if available)
- `getIndegrees()` — import in-degree counts (hub detection)

---

### **Stage 6: Vector Search** (`packages/engine/src/context/context.ts:106-108` + `vector.ts`)
- Only if `enable_embeddings=true` AND embeddings exist
- Embeds query via Voyage, cosine similarity against chunk embeddings
- Returns top 10 code chunks (excludes doc files)

---

### **Stage 7: TF-IDF Scoring** (`packages/engine/src/context/query-interpreter.ts:296-490`)
`interpretQuery()` scores each file:
- **Path tokens** — filename/dir segments (+4× weight exact match)
- **Exports** — matched symbols (+2.5× for decomposed camelCase)
- **Docstrings/purpose/sections/internals** — +1× each
- **Query-kind boosts**:
  - stack_trace: +50 per frame match
  - symbol: +100 if export matches, +80 if internal
  - error_message: +30–40 for error token in metadata
- **Dampening**:
  - Noise paths → score=0
  - Hub penalty (exports > 5): `score *= 1/(1 + log₂(exportCount/5) * 0.3)`
- **Boosts**:
  - Recent git activity: +0.5 per recent commit (max 5)
  - Vocab cluster membership: ×1.3
  - High in-degree (≥3): ×(1 + log₂(degree) × 0.1)
- **Dedup**: Max 2 files per "sibling key" (same dir + similar filename stem)
- **Cap**: `min(15, max(8, depth*2 + 4))` based on import graph depth

---

### **Stage 8: Error Content Search** (`packages/engine/src/context/context.ts:126-156`)
For `error_message` queries only:
- Searches chunk content for raw error string (minus common prefixes)
- Caps at 3 scored + 3 unscored files
- Adds +40 score per match

---

### **Stage 9: Co-change Promotion** (`packages/engine/src/context/context.ts:158-174`)
- Takes top 5 scored files
- Looks up git co-change partners (files modified together ≥5x)
- Promotes up to 3 non-noise partners into results

---

### **Stage 10: Semantic Merge** (`packages/engine/src/context/context.ts:176-209`)
- Merges vector search results into TF-IDF results
- Takes top 5 non-duplicate, non-noise semantic matches
- Extracts signature line for reason text
- Evicts lowest-ranked files if needed to stay under cap

---

### **Stage 11: Structural Enrichment** (`packages/engine/src/context/context.ts:214-265`)
- `getReverseImports()` — who imports each hit file
- `getForwardImports()` — what each hit file imports
- `get2HopReverseDeps()` — 2-hop upstream callers for top 3 files
- `getCochanges()` — git co-change pairs
- **Cluster promotion**: Groups co-changes into clusters (≥5x), promotes cluster members up to cap

---

### **Stage 12: Snippet Resolution** (`packages/engine/src/context/context.ts:256-265` + `snippet.ts`)
`resolveSnippets()` for top 5 files:
- Stack frame match → uses frame line number
- Symbol match → finds definition line via regex
- Best export → picks export matching query tokens
- Returns `{ path, symbol, line, matchKind }` map

---

### **Stage 13: Context Slicing** (`packages/engine/src/context/context.ts:267-270` + `slicer.ts`)
`sliceContext()` extracts ±10 lines around resolved symbols:
- symbol: 1 slice max
- error_message: 1 slice
- stack_trace: 2 slices
- natural: 3 slices

---

### **Stage 14: Test File Discovery** (`packages/engine/src/context/structural.ts:86-130`)
`discoverTestFiles()` for top 5 source files:
- Reverse importers matching `*.test.*`, `*.spec.*`, `__tests__/`
- Co-change partners matching test patterns
- Path sibling heuristics (e.g., `foo.test.ts`)

---

### **Stage 15: Formatting** (`packages/engine/src/context/formatter.ts:410-434`)
`formatContextPack()` generates markdown:
- **symbol** → Definition + signature + dependents + co-changes + other files
- **error_message** → Error source + imports + also references
- **stack_trace** → Crash point + call chain + related files
- **natural** → Key files list + exports + imports + co-changes + tests

Includes code slices in fenced blocks with language tag.

---

### **Stage 16: Progressive Stripping** (`packages/engine/src/context/formatter.ts:328-391`)
If output exceeds 2000 tokens (est. `length/4`):
1. Strip fenced code blocks
2. Truncate co-change lists to 1 per file
3. Drop ## Tests section
4. Truncate import arrows
5. Reduce to top 5 files
6. Drop purpose summaries (last resort)

---

### **Stage 17: Response** (`packages/engine/src/context/context.ts:291-319`)
Returns `ContextResponse`:
```ts
{
  context_pack: string,        // formatted markdown
  stats: {
    files_in_context: number,
    index_fresh: boolean,
    duration_ms: number,
    cached: boolean
  },
  ranked_files?: [{ path, reason, score }],  // if includeRankedFiles
  query_kind?: QueryKind                      // if includeRankedFiles
}
```

---

## Report

- **Tool calls**: 12
- **Files read**: 8
- **Key findings**:
  - Pipeline is 17 stages: HTTP → index check → cache → parse → load → vector → TF-IDF → error search → co-change → semantic merge → structural enrichment → snippets → slicing → tests → format → strip → response
  - Core scoring is TF-IDF with query-kind-specific boosts (symbol +100, stack frame +50, error token +30-40), hub dampening, and recent-activity boosts
  - Context slicing extracts ±10 lines around resolved symbols (phase 3 feature)
  - Progressive stripping keeps output under 2000 tokens by removing code first, then metadata
  - Caching: 120s TTL, 20 entries, key includes repo+commit+embed+goal
