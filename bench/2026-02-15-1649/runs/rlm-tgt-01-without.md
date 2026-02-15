## Report

- **Tool calls**: 4
- **Files read**: 1
- **Key findings**:
  - `fileCochanges` table in `packages/engine/src/db/schema.ts:114-129` stores co-change pairs between files
  - Schema: `id`, `repo_id` (FK to repos), `path_a`, `path_b`, `cochange_count` (defaults to 1)
  - Unique index on `(repo_id, path_a, path_b)` ensures no duplicate pairs
  - Index on `(repo_id, path_a)` enables fast lookup by one side of the pair
  - `cochangeQueries` (lines 641-703) provides `upsert()` for inserting/incrementing, `forPaths()` and `forPathsAboveMin()` for retrieval
