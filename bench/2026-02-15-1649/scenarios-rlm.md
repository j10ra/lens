#### rlm-exp-01
- **Category**: Exploratory
- **Prompt**:
  `Trace the full context pack generation pipeline from POST /context request to response. What are the main stages and which files implement each?`
- **Judge Criteria**:
  1. `POST /context` route is handled in `apps/daemon/src/server.ts`
  2. `buildContext()` in `packages/engine/src/context/context.ts` orchestrates the pipeline
  3. `formatContextPack()` in `packages/engine/src/context/formatter.ts` formats output with TOKEN_CAP = 2000
  4. Caching is implemented with 120s TTL and 20 entry max in context.ts

#### rlm-exp-02
- **Category**: Exploratory
- **Prompt**:
  `Map out the repository indexing pipeline. What stages run during core indexing vs enrichment, and what triggers each?`
- **Judge Criteria**:
  1. Core index implemented in `packages/engine/src/index/engine.ts` via `runIndex()`
  2. Core stages: discovery, chunking, metadata extraction, import graph, git analysis
  3. Enrichment stages (post-index): vocab clusters, embeddings via `ensureEmbedded()`, purpose summaries via `enrichPurpose()`
  4. `lens context` triggers diff scan but NOT enrichment; `lens repo register` triggers full scan + enrichment

#### rlm-exp-03
- **Category**: Exploratory
- **Prompt**:
  `How does the MCP server integration work? Trace the flow from MCP tool registration to context response.`
- **Judge Criteria**:
  1. MCP server created in `apps/daemon/src/mcp.ts` via `createMcpServer()`
  2. Uses `server.registerTool()` (not deprecated `server.tool()`) for tool registration
  3. `get_context` tool takes `repo_path` and `goal` parameters
  4. Falls back to `findOrRegisterRepo()` if repo not already registered

#### rlm-dbg-01
- **Category**: Debug
- **Prompt**:
  `A user reports that import graph edges are missing for some TypeScript files. Trace the import extraction logic and identify potential failure points.`
- **Judge Criteria**:
  1. Import extraction in `packages/engine/src/index/imports.ts` via `extractImportSpecifiers()`
  2. TypeScript regex: `TS_IMPORT_RE` matches import/require statements
  3. Only relative imports (starting with `.`) are extracted
  4. Resolution tries extensions `.ts`, `.tsx`, `.js`, `.jsx`, `/index.ts`, `/index.js`

#### rlm-dbg-02
- **Category**: Debug
- **Prompt**:
  `Context pack responses are truncating unexpectedly. Find the token cap logic and explain what happens when it's exceeded.`
- **Judge Criteria**:
  1. `TOKEN_CAP = 2000` defined at top of `packages/engine/src/context/formatter.ts`
  2. `estimateTokens()` divides string length by 4 for token estimation
  3. `filterByScoreRelevance()` filters files by score threshold before formatting
  4. Different formatters for query kinds: `formatSymbol()`, `formatError()`, `formatGeneral()`

#### rlm-dbg-03
- **Category**: Debug
- **Prompt**:
  `A repo registration returns 429 "Repo limit reached" but the user only has 3 repos. Trace the quota check logic.`
- **Judge Criteria**:
  1. Quota check in `apps/daemon/src/server.ts` at `/repo/register` endpoint
  2. `quotaCache` stores plan/quota/usage with 5-minute TTL (`QUOTA_TTL = 5 * 60_000`)
  3. Default max repos is 50 if `quotaCache?.quota?.maxRepos` undefined
  4. `quotaRemaining()` returns `Infinity` if `quotaCache` is null

#### rlm-chg-01
- **Category**: Change-Impact
- **Prompt**:
  `I want to add a new per-repo feature toggle `enable_code_slicing` to control context slicing. What schema changes and files need modification?`
- **Judge Criteria**:
  1. Schema table `repos` in `packages/engine/src/db/schema.ts` has existing toggles: `enable_embeddings`, `enable_summaries`, `enable_vocab_clusters`
  2. `repoQueries.updateProFeatures()` in `packages/engine/src/db/queries.ts` handles toggle updates
  3. Dashboard API at `/api/dashboard/repos/:id/settings` in `apps/daemon/src/server.ts` calls `updateProFeatures()`
  4. Migration needed in schema.ts; defaults should follow existing pattern (`integer().notNull().default(1)`)

#### rlm-chg-02
- **Category**: Change-Impact
- **Prompt**:
  `I need to add a new database table `file_signatures` to store function signatures for each file. What files need changes?`
- **Judge Criteria**:
  1. Schema definitions in `packages/engine/src/db/schema.ts` use `sqliteTable()` from drizzle-orm
  2. New table needs foreign key to `repos.id` with `onDelete: "cascade"`
  3. Queries file `packages/engine/src/db/queries.ts` would need new query helpers
  4. Metadata extraction in `packages/engine/src/index/extract-metadata.ts` could populate signatures

#### rlm-chg-03
- **Category**: Change-Impact
- **Prompt**:
  `I want to add Python `uv` import support alongside pip. Which files handle Python import extraction and resolution?`
- **Judge Criteria**:
  1. `packages/engine/src/index/imports.ts` contains `PY_IMPORT_RE` regex for Python
  2. `resolvePython()` handles relative import resolution with `.` and `..` prefixes
  3. Python extensions tried: `.py`, `/__init__.py` via `PY_EXTENSIONS` array
  4. Language detection via `detectLanguage()` in `packages/engine/src/index/discovery.ts`

#### rlm-tgt-01
- **Category**: Targeted
- **Prompt**:
  `Find the database schema definition for storing co-change pairs between files.`
- **Judge Criteria**:
  1. Table `fileCochanges` in `packages/engine/src/db/schema.ts`
  2. Columns: `id`, `repo_id`, `path_a`, `path_b`, `cochange_count`
  3. Unique index on `(repo_id, path_a, path_b)`
  4. Lookup index on `(repo_id, path_a)`

#### rlm-tgt-02
- **Category**: Targeted
- **Prompt**:
  `What is the maximum commit count analyzed during git history analysis?`
- **Judge Criteria**:
  1. `MAX_COMMITS = 2000` constant in `packages/engine/src/index/git-analysis.ts`
  2. Also `MAX_FILES_PER_COMMIT = 20` to limit per-commit file pairs
  3. `RECENT_DAYS = 90` for "recent" activity classification
  4. `analyzeGitHistory()` uses `git log --name-only --format=%H %aI --no-merges`

#### rlm-tgt-03
- **Category**: Targeted
- **Prompt**:
  `Find the Voyage AI embedding configuration: model name, dimensions, and batch size.`
- **Judge Criteria**:
  1. `apps/encore/index/lib/models.ts` defines Voyage configuration
  2. `EMBEDDING_MODEL = "voyage-code-3"`
  3. `EMBEDDING_DIM = 1024`
  4. `EMBEDDING_BATCH_SIZE = 32`
