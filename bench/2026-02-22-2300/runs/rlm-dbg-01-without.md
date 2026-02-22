Now I have the complete picture. Let me provide the analysis.

## Report

- **Tool calls**: 10
- **Tools used**: ToolSearch, Grep, Read
- **Files read**: 8
- **Files used**: packages/engine/src/grep/grep.ts, packages/engine/src/grep/scorer.ts, packages/engine/src/grep/structural.ts, packages/engine/src/graph/graph.ts, packages/engine/src/index/import-graph.ts, packages/engine/src/index/extract-metadata.ts, packages/engine/src/parsers/typescript/resolve.ts, packages/engine/src/parsers/typescript/imports.ts, packages/engine/src/index/engine.ts, packages/engine/src/db/schema.ts, packages/engine/src/parsers/common/resolve.ts
- **Key findings**:

  1. **Hub detection location**: `packages/engine/src/grep/scorer.ts:186` — `isHub = indegree >= HUB_THRESHOLD` (threshold = 5)

  2. **Data flow for isHub**:
     - `getIndegrees()` (structural.ts:12) queries `fileImports` table grouped by `target_path`
     - `fileImports` populated by `buildAndPersistImportGraph()` (import-graph.ts:5)
     - Import graph builder reads `meta.imports` JSON, resolves via `parser.resolveImport()`

  3. **Most likely failure causes**:
     - **Empty `fileImports` table**: Repo never indexed or import graph not built
     - **Resolution failures** in `resolve.ts:7` — only handles relative imports (`spec.startsWith(".")`)
     - **Path mismatch**: `resolveImport()` checks `knownPaths.has(candidate)` — if stored paths differ from resolved paths (e.g., different normalization), resolution fails
     - **Malformed `meta.imports`**: JSON parse fails silently (import-graph.ts:18), resulting in empty specifiers array

  4. **Key code paths to debug**:
     - Check `fileImports` table for rows: `SELECT COUNT(*) FROM file_imports WHERE repo_id = ?`
     - Check `fileMetadata.imports` field for valid JSON arrays
     - Verify path normalization matches between `knownPaths` and resolved imports
     - Confirm `buildAndPersistImportGraph()` is called during indexing (engine.ts:75)
