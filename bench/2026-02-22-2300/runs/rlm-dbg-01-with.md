Boss, here's the analysis:

## Hub Detection Architecture

The `isHub` flag flows through these layers:

### 1. Data Source (`structural.ts:12-28`)
```typescript
export function getIndegrees(db: Db, repoId: string): Map<string, number> {
  // Queries fileImports table, counts importers per target
  const rows = db.select({target_path, cnt: count(*)})
    .from(fileImports)
    .where(eq(fileImports.repo_id, repoId))
    .groupBy(target_path)
    .all();
}
```

### 2. Calculation (`scorer.ts:8, 77-78, 186-187`)
```typescript
const HUB_THRESHOLD = 5;
const indegrees = getIndegrees(db, repoId);  // Line 77
const isHub = indegree >= HUB_THRESHOLD;     // Line 186
const hubScore = indegree / maxIndegree;     // Line 187
```

### 3. Propagation (`grep.ts:96-97`)
The `ScoredFile` carries `isHub`/`hubScore` to `EnrichedMatch`.

---

## Why `isHub` Could Be Missing/False

### Most Likely: Empty `fileImports` Table

The import graph must be built during indexing (`engine.ts:75`):

```typescript
extractAndPersistMetadata(db, repoId, fileContents);
buildAndPersistImportGraph(db, repoId);  // ← Must run
```

If `getIndegrees()` returns an empty map, **every file gets indegree=0 → isHub=false**.

### Import Resolution Failures (`import-graph.ts:14-28`)

Several conditions can produce zero edges:

| Condition | Code | Effect |
|-----------|------|--------|
| No parser for language | `getParser(meta.language)` returns null | File skipped |
| Empty imports metadata | `meta.imports` is `"[]"` or null | No edges |
| Unresolved import | `parser.resolveImport()` returns null | Edge skipped |
| Target not in `knownPaths` | Resolved path not in indexed files | Edge skipped |

### Quick Diagnostic Queries

```sql
-- Check if import graph exists
SELECT COUNT(*) FROM file_imports WHERE repo_id = '<repoId>';

-- Check which files have imports metadata
SELECT path, imports FROM file_metadata WHERE repo_id = '<repoId>' AND imports != '[]';

-- Check max indegree
SELECT target_path, COUNT(*) as cnt FROM file_imports 
WHERE repo_id = '<repoId>' GROUP BY target_path ORDER BY cnt DESC LIMIT 10;
```

---

## Report

- **Tool calls**: 9
- **Tools used**: ToolSearch, Grep, Read
- **Files read**: 6
- **Files used**: `packages/engine/src/grep/scorer.ts`, `packages/engine/src/grep/structural.ts`, `packages/engine/src/grep/grep.ts`, `packages/engine/src/index/import-graph.ts`, `packages/engine/src/index/engine.ts`, `packages/engine/src/graph/graph.ts`
- **Key findings**:
  - `isHub = indegree >= 5` (threshold constant in `scorer.ts:8`)
  - Indegrees come from `getIndegrees()` which queries `fileImports` table
  - Empty `fileImports` table → all files get `isHub=false`
  - Import graph built by `buildAndPersistImportGraph()` during indexing
  - Failure points: missing parser, empty imports metadata, unresolved paths, target not in knownPaths
