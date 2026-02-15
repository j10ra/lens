## Report

- **Tool calls**: 1
- **Files read**: 1
- **Key findings**:
  - **`fileCochanges`** table (lines 114-129) stores co-change pairs with columns: `id`, `repo_id`, `path_a`, `path_b`, `cochange_count`
  - Unique constraint on `(repo_id, path_a, path_b)` ensures each file pair is stored once per repo
  - Index on `(repo_id, path_a)` enables efficient lookup of all co-change partners for a given file
  - Foreign key cascades delete co-changes when parent repo is deleted
