Now I have a complete picture. Here's the summary of files that need changes to add a `file_signatures` table:

## Files That Need Changes

### 1. **`packages/engine/src/db/schema.ts`** — Add table definition
Define the new `fileSignatures` table with columns like:
- `id`, `repo_id`, `path` (FK to repos, unique constraint on repo_id+path)
- `signatures` (JSON text field for storing function signatures)
- `updated_at`

### 2. **`packages/engine/src/types.ts`** — Add TypeScript interface
Add `FileSignature` interface matching the schema.

### 3. **`packages/engine/src/db/queries.ts`** — Add query functions
Add `signatureQueries` object with:
- `upsert(db, repoId, path, signatures)`
- `getByRepo(db, repoId)`
- `getByPath(db, repoId, path)`
- `deleteByPath(db, repoId, path)`
- Update `repoQueries.remove()` to also delete from `fileSignatures`

### 4. **`packages/engine/src/db/connection.ts`** — Add migration
- Add `CREATE TABLE IF NOT EXISTS file_signatures` to `createTablesSql()`
- Add migration block to add table if it doesn't exist (for existing DBs)

### 5. **`packages/engine/src/index/extract-metadata.ts`** — Add signature extraction
Add `extractSignatures()` function that parses function signatures (params, return types) and update `extractAndPersistMetadata()` to also persist signatures.

### 6. **`packages/engine/src/index/engine.ts`** — Optional cleanup
Add cleanup logic in `runIndex()` to prune orphan signature rows for deleted files (similar to metadata cleanup).

---

## Report

- **Tool calls**: 6
- **Files read**: 6
- **Key findings**:
  - Schema defined in `packages/engine/src/db/schema.ts` using Drizzle ORM sqliteTable pattern
  - Types defined in `packages/engine/src/types.ts` with matching interfaces
  - Queries in `packages/engine/src/db/queries.ts` follow a pattern of grouped query objects (e.g., `metadataQueries`, `statsQueries`)
  - Connection/migration in `packages/engine/src/db/connection.ts` uses raw SQL in `createTablesSql()` + pragma checks for column migrations
  - Metadata extraction in `packages/engine/src/index/extract-metadata.ts` already extracts exports/imports/docstrings — signatures would be a natural extension
  - `repoQueries.remove()` cascades deletes to all related tables — must include new table
