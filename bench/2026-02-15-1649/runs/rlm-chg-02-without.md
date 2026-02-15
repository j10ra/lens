Boss, here are the files that need changes to add a `file_signatures` table:

## Required Changes

| File | Change |
|------|--------|
| `packages/engine/src/db/schema.ts` | Add `fileSignatures` table definition with Drizzle sqliteTable |
| `packages/engine/src/db/connection.ts` | Add CREATE TABLE SQL in `createTablesSql()`, add migration logic if needed |
| `packages/engine/src/db/queries.ts` | Add `signatureQueries` object with upsert/getByRepo/deleteByPath methods |
| `packages/engine/src/types.ts` | Add `FileSignature` and `FileSignatureRow` interfaces |
| `packages/engine/src/index/extract-metadata.ts` | Add signature extraction logic + extend `FileMetadataExtracted` interface |
| `packages/engine/src/index.ts` | Export new `signatureQueries` from queries.ts |

## Optional (if using signatures in context)

| File | Change |
|------|--------|
| `packages/engine/src/context/structural.ts` | Add loader for signatures if needed during context building |
| `packages/engine/src/context/formatter.ts` | Render signatures in context pack output |

## Report

- **Tool calls**: 6
- **Files read**: 6
- **Key findings**:
  - Schema pattern: `sqliteTable()` with `uuid()`, `now()` helpers, `repo_id` FK to `repos.id` with cascade delete
  - Migration pattern: `sqlite.pragma("table_info(...)")` check + ALTER TABLE in `openDb()`
  - Query pattern: separate query objects (`metadataQueries`, `chunkQueries`) with upsert using `onConflictDoUpdate`
  - Types pattern: separate row types for DB vs clean interfaces (e.g., `FileMetadata` vs `FileMetadataRow`)
  - Extraction pattern: `extractAndPersistMetadata()` aggregates chunks per file, then calls queries
