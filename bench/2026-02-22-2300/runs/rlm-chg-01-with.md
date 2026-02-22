Based on my analysis, here are all the files that would need modification to add a `complexity_score` field:

## Required Modifications

### 1. Type Definition
**`packages/engine/src/index/extract-metadata.ts`**
- Add `complexity_score: number` to the `FileMetadata` interface (line 7-16)
- Compute the score in `extractFileMetadata()` function (line 18-32)

### 2. Database Schema
**`packages/engine/src/db/schema.ts`**
- Add `complexity_score: real("complexity_score").default(0)` to the `fileMetadata` table definition (line 50-67)

### 3. Query Layer
**`packages/engine/src/db/queries.ts`**
- Update `metadataQueries.upsert()` to accept and persist `complexity_score` (line 223-273)
- Include the field in both INSERT and UPDATE operations

### 4. Database Migration (New File)
**`packages/engine/drizzle/0002_add_complexity_score.sql`**
```sql
ALTER TABLE `file_metadata` ADD `complexity_score` real DEFAULT 0;
```

### 5. HTTP API Response
**`apps/daemon/src/routes/files.ts`**
- Include `complexity_score` in the response of `GET /repos/:repoId/files/:filePath` (line 159-178)

### 6. Optional: Type Export
**`packages/engine/src/index.ts`**
- Add `export type { FileMetadata } from "./index/extract-metadata.js";` if external consumers need the type (currently NOT exported)

### 7. Optional: Scoring Integration
**`packages/engine/src/grep/scorer.ts`**
- Could use `complexity_score` as an additional ranking signal in `interpretQuery()` if desired

---

## Report

- **Tool calls**: 14
- **Tools used**: mcp__lens__lens_grep, mcp__lens__lens_graph_neighbors, Read, Grep, Glob
- **Files read**: 8
- **Files used**: packages/engine/src/index/extract-metadata.ts, packages/engine/src/db/schema.ts, packages/engine/src/db/queries.ts, apps/daemon/src/routes/files.ts, packages/engine/src/index.ts, packages/engine/src/index/engine.ts, packages/engine/src/grep/scorer.ts, packages/engine/drizzle/0001_free_sphinx.sql
- **Key findings**:
  - `FileMetadata` interface defined in `extract-metadata.ts` with 8 fields (path, language, exports, imports, docstring, sections, internals, symbols)
  - Database uses drizzle-orm with SQLite; schema in `db/schema.ts`
  - Migrations are incremental SQL files in `packages/engine/drizzle/`
  - `FileMetadata` type is NOT exported from the main barrel (`index.ts`)
  - HTTP route `files.get` manually constructs JSON response from metadata fields
  - Scorer uses metadata fields for TF-IDF but doesn't access complexity currently
