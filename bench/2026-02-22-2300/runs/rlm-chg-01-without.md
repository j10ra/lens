Based on my analysis, here are all the files that would need to be modified to add `complexity_score` to file metadata:

## Files to Modify

### Core Type & Extraction
| File | Changes Required |
|------|------------------|
| `packages/engine/src/index/extract-metadata.ts` | Add `complexity_score: number` to `FileMetadata` interface (line 7-16); compute it in `extractFileMetadata()` (line 18-32); pass it in `extractAndPersistMetadata()` (line 41-50) |

### Database Layer
| File | Changes Required |
|------|------------------|
| `packages/engine/src/db/schema.ts` | Add `complexity_score: real/integer` column to `fileMetadata` table (around line 64) |
| `packages/engine/src/db/queries.ts` | Update `metadataQueries.upsert()` to include complexity_score in INSERT/UPDATE (lines 244-270) |

### API Layer
| File | Changes Required |
|------|------------------|
| `apps/daemon/src/routes/files.ts` | Include `complexity_score` in `GET /:repoId/files/:filePath` response (line 159-178) |

### Migration
| File | Changes Required |
|------|------------------|
| `packages/engine/drizzle/0002_*.sql` | New migration file needed: `ALTER TABLE file_metadata ADD complexity_score real DEFAULT 0` |

### Optional (if scoring should use complexity)
| File | Changes Required |
|------|------------------|
| `packages/engine/src/grep/scorer.ts` | Add complexity factor to scoring algorithm if it should influence search ranking |

---

**Note:** The `FileMetadata` type is NOT exported from `packages/engine/src/index.ts` (the barrel export), so no external consumers need updating.

## Report

- **Tool calls**: 13
- **Tools used**: ToolSearch, Grep, Glob, Read
- **Files read**: 9
- **Files used**: packages/engine/src/parsers/types.ts, packages/engine/src/index/extract-metadata.ts, packages/engine/src/db/schema.ts, packages/engine/src/db/queries.ts, packages/engine/src/grep/scorer.ts, packages/engine/src/index/engine.ts, apps/daemon/src/routes/files.ts, packages/engine/drizzle/0001_free_sphinx.sql, packages/engine/src/index.ts
- **Key findings**:
  - `FileMetadata` interface defined in `extract-metadata.ts` with 8 fields (path, language, exports, imports, docstring, sections, internals, symbols)
  - Type is NOT exported from main barrel (`index.ts`) — internal use only
  - Database schema uses SQLite `file_metadata` table with JSON-serialized arrays
  - `metadataQueries.upsert()` handles INSERT/UPDATE with all fields
  - `files.ts` route returns full metadata in `GET /:repoId/files/:filePath`
  - New drizzle migration required for schema change
