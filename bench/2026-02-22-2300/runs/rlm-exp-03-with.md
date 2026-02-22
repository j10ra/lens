Now I have a complete picture of the indexing engine. Here's the architecture:

## Indexing Pipeline Overview

### 1. File Discovery (`discovery.ts`)

**Full Scan** — `fullScan(repoRoot)`:
- Uses `git ls-files -z` to enumerate all tracked files
- Filters out binary extensions (`.png`, `.pdf`, `.sqlite`, etc.)
- Skips files >2MB (`MAX_FILE_SIZE`)
- Returns `DiscoveredFile[]` with path, absolutePath, language, status

**Diff Scan** — `diffScan(repoRoot, fromCommit, toCommit)`:
- Uses `git diff --name-status --diff-filter=ACMRD -z ${fromCommit}..${toCommit}`
- Returns only changed files with status: `added | modified | deleted`
- Same binary/size filtering as full scan

**Language Detection**:
- Extension → language mapping via `LANG_MAP` (TS/JS, Python, Go, Rust, etc.)

---

### 2. Metadata Extraction (`extract-metadata.ts`)

For each discovered file:
1. **Parser lookup** via `getParser(language)` from registry
2. **Extract via parser**:
   - `exports` — named exports
   - `imports` — import specifiers (unresolved)
   - `symbols` — functions, classes, variables with line numbers
   - `docstring` — file-level comment
   - `sections` — `// === Section Name` markers
   - `internals` — non-exported declarations

3. **Persist** to `fileMetadata` table (upsert by repo_id + path)

---

### 3. Import Graph Construction (`import-graph.ts`)

`buildAndPersistImportGraph(db, repoId)`:
1. Clear existing edges for repo
2. Load all file metadata → `knownPaths` set
3. For each file:
   - Parse import specifiers from stored JSON
   - **Resolve** relative imports via parser's `resolveImport()`:
     - Normalize path relative to source file
     - Try exact match, then add `.ts`, `.tsx`, `/index.ts`, etc.
     - Strip `.js` extensions (TS emits `.js` imports)
   - Build edge: `sourcePath → targetPath`
4. Batch insert edges to `fileImports` table

---

### 4. Git Analysis (`git-analysis.ts`)

**Commit Parsing**: `git log --name-only --format=%H%x00%aI --no-merges`

**Two outputs**:
- **Per-file stats** → `fileStats` table:
  - `commit_count`, `recent_count` (last 90 days), `last_modified`
- **Co-change pairs** → `fileCochanges` table:
  - Files modified together in same commit
  - Skip commits >50 files (noise from monorepo roots)
  - O(n²) pair generation, bounded by commit file limit

---

## Incremental Indexing Strategy

**Key mechanism**: Store `last_indexed_commit` and `last_git_analysis_commit` in `repos` table.

```
ensureIndex(db, repoId):
  1. Get HEAD commit
  2. If HEAD === last_indexed_commit AND no symbol backfill needed → SKIP
  3. If first index OR force OR symbol backfill:
       → fullScan() all files
     Else:
       → diffScan(last_commit, HEAD) only changed files
  4. Extract metadata for changed files (upsert)
  5. Rebuild import graph (clear + rebuild)
  6. Incremental git analysis since last_git_analysis_commit
  7. Update last_indexed_commit to HEAD
```

**Symbol Backfill**: If repo has symbol-eligible files but no symbols stored, triggers full rescan even when HEAD unchanged.

**Concurrency**: In-memory mutex (`locks` map) prevents concurrent indexing of same repo.

---

## Data Model

| Table | Purpose |
|-------|---------|
| `repos` | Repo registration, index state tracking |
| `fileMetadata` | Per-file exports/imports/symbols/docstrings |
| `fileImports` | Resolved import edges (source → target) |
| `fileStats` | Commit counts, recent activity |
| `fileCochanges` | Pairwise co-change frequencies |

---

## Report

- **Tool calls**: 10
- **Tools used**: mcp__lens__lens_graph, Glob, Read
- **Files read**: 8
- **Files used**: packages/engine/src/index/engine.ts, packages/engine/src/index/discovery.ts, packages/engine/src/index/extract-metadata.ts, packages/engine/src/index/import-graph.ts, packages/engine/src/index/git-analysis.ts, packages/engine/src/parsers/registry.ts, packages/engine/src/parsers/typescript/resolve.ts, packages/engine/src/db/schema.ts
- **Key findings**:
  - Incremental indexing via git diff between stored `last_indexed_commit` and HEAD
  - Import resolution uses extension probing (`.ts`, `.tsx`, `/index.ts`) after stripping emitted `.js`
  - Co-change analysis skips large commits (>50 files) to filter monorepo noise
  - Parser registry pattern enables language-agnostic extraction with pluggable resolvers
  - Mutex prevents concurrent repo indexing; symbol backfill triggers full rescan when needed
