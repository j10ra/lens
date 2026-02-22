Boss, here's how the LENS v2 indexing engine works:

## 1. File Discovery (`discovery.ts`)

Two modes driven by git:

**Full Scan** — Uses `git ls-files -z` to enumerate all tracked files. Filters:
- Binary extensions (47 types: `.png`, `.lock`, `.sqlite`, etc.)
- Files > 2MB

**Diff Scan** — Uses `git diff --name-status --diff-filter=ACMRD -z ${fromCommit}..${toCommit}` for incremental. Parses status chars:
- `A` → added
- `D` → deleted
- `M/R/C` → modified

Language detection via extension map (23 languages: `.ts`→typescript, `.py`→python, etc.).

## 2. Metadata Extraction (`extract-metadata.ts`)

Parser-based delegation. For each file:

```
extractFileMetadata(content, path, language)
  → parser.extractImports(content)     // raw specifiers
  → parser.extractExports(content)     // exported names
  → parser.extractDocstring(content)   // JSDoc/comment header
  → parser.extractSections(content)    // comment markers
  → parser.extractSymbols(content)     // functions/classes with line numbers
```

**TypeScript parser** (`parsers/typescript/imports.ts`) uses regex to capture:
- Static imports: `import ... from '...'`
- Dynamic imports: `import('...')`
- Requires: `require('...')`
- Re-exports: `export ... from '...'`

Only keeps relative imports (`./` or `../`). Results upserted to `file_metadata` table as JSON arrays.

## 3. Import Graph Construction (`import-graph.ts`)

**Two-pass algorithm:**

1. Load all file metadata, build `knownPaths` set
2. For each file's imports, resolve specifier → concrete path

**Resolution** (`parsers/typescript/resolve.ts`):
- Only resolves relative imports
- Normalizes path, strips `.js/.jsx/.mjs` (TS emits these but sources are `.ts`)
- Tries extension variants: `.ts`, `.tsx`, `.js`, `.jsx`, `/index.ts`, etc.

Edges stored in `file_imports` table (source → target). Deduplicated with unique index.

## 4. Git History Analysis (`git-analysis.ts`)

Runs `git log --name-only --format=%H%x00%aI --no-merges` to get commits with files.

**Per-file stats:**
- `commit_count` — total commits touching file
- `recent_count` — commits in last 90 days
- `last_modified` — most recent commit date

**Co-change pairs:** For each commit (skipping >50 files to avoid monorepo noise), generates all file pairs (O(n²) bounded). Counts how often files appear together. Filters pairs with count < 1.

## 5. Incremental Indexing Strategy (`engine.ts`)

**Smart diff-based reindex:**

```typescript
const headCommit = await getHeadCommit(repo.root_path);
const hasSymbols = metadataQueries.hasAnySymbols(db, repoId);
const needsSymbolBackfill = hasSymbolEligibleFiles && !hasSymbols;

if (!force && repo.last_indexed_commit === headCommit && !needsSymbolBackfill) {
  return { skipped: true }; // No work needed
}
```

**Triggers full scan when:**
- `force=true` (explicit reindex)
- No `last_indexed_commit` (first run)
- Symbol backfill needed (TS/JS files exist but no symbols extracted)

**Otherwise diff scan** — only processes changed files since last indexed commit.

**Concurrency:** In-memory mutex per repo (`withLock()`) prevents parallel indexing.

## Data Flow Summary

```
git ls-files / git diff
       ↓
   DiscoveredFile[]  (path, language, status)
       ↓
   readFile() → content map
       ↓
   extractAndPersistMetadata() → file_metadata table
       ↓
   buildAndPersistImportGraph() → file_imports table
       ↓
   analyzeGitHistory() → file_stats + file_cochanges tables
       ↓
   updateIndexState(commit, "ready")
```

---

## Report

- **Tool calls**: 11
- **Tools used**: ToolSearch, Glob, Read
- **Files read**: 11
- **Files used**: packages/engine/src/index/engine.ts, packages/engine/src/index/discovery.ts, packages/engine/src/index/extract-metadata.ts, packages/engine/src/index/import-graph.ts, packages/engine/src/index/git-analysis.ts, packages/engine/src/parsers/registry.ts, packages/engine/src/parsers/types.ts, packages/engine/src/parsers/typescript/index.ts, packages/engine/src/parsers/typescript/imports.ts, packages/engine/src/parsers/typescript/resolve.ts, packages/engine/src/db/schema.ts, packages/engine/src/db/queries.ts
- **Key findings**:
  - **Discovery**: Git-powered via `ls-files` (full) or `diff --name-status` (incremental), filters binaries/oversized files
  - **Metadata**: Parser registry delegates to language-specific extractors; TypeScript uses regex for imports/exports/symbols
  - **Import graph**: Two-pass resolution — collect known paths, then resolve each import to concrete file with extension mapping
  - **Incremental**: Compares `last_indexed_commit` to HEAD; diff scan only if unchanged, full scan on first run/symbol backfill/force
  - **Concurrency**: Per-repo in-memory mutex prevents parallel indexing race conditions
