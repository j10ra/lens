Now I have all the information needed. Here's the complete analysis:

## Schema Changes and File Modifications for `enable_code_slicing`

### 1. Database Schema (`packages/engine/src/db/schema.ts`)

Add new column to `repos` table (line 28, after `enable_vocab_clusters`):
```typescript
enable_code_slicing: integer("enable_code_slicing").notNull().default(1),
```

### 2. Database Migration (`packages/engine/src/db/connection.ts`)

Add migration check in `runMigrations()` (around line 46):
```typescript
if (!repoCols.has("enable_code_slicing"))
  sqlite.exec("ALTER TABLE repos ADD COLUMN enable_code_slicing INTEGER NOT NULL DEFAULT 1");
```

Update `CREATE TABLE repos` schema in `resetSchema()` (around line 94):
```typescript
enable_code_slicing INTEGER NOT NULL DEFAULT 1,
```

### 3. Queries (`packages/engine/src/db/queries.ts`)

Update `updateProFeatures()` (line 133-143):
- Add `enable_code_slicing?: number` to `flags` parameter type
- Add mapping: `if (flags.enable_code_slicing !== undefined) set.enable_code_slicing = flags.enable_code_slicing;`

### 4. Types (`packages/engine/src/types.ts`)

Add to `Repo` interface (around line 14):
```typescript
enable_code_slicing: number;
```

### 5. Context Pipeline (`packages/engine/src/context/context.ts`)

Guard slicing at line 267-270:
```typescript
trace?.step("sliceContext");
const { sliceContext: sliceCtx } = await import("./slicer");
const slices = repo?.enable_code_slicing !== 0
  ? sliceCtx(db, repoId, snippets, parsed.kind)
  : new Map();
trace?.end("sliceContext", `${slices.size} slices`);
```

### 6. Daemon API (`apps/daemon/src/server.ts`)

**Dashboard endpoint** (around line 977): Add to repo response:
```typescript
enable_code_slicing: r.enable_code_slicing,
```

**Settings update endpoint** (around line 1034-1041):
- Add `enable_code_slicing?: boolean` to request body type
- Add flag mapping: `if (body.enable_code_slicing !== undefined) flags.enable_code_slicing = body.enable_code_slicing ? 1 : 0;`

### 7. Dashboard API Types (`apps/dashboard/src/lib/api.ts`)

Add to repo type (around line 43):
```typescript
enable_code_slicing: number;
```

Add to settings param (around line 173):
```typescript
settings: { ..., enable_code_slicing?: boolean }
```

### 8. Dashboard UI (`apps/dashboard/src/pages/Repos.tsx` + `RepoDetail.tsx`)

Add toggle UI for `enable_code_slicing` following the existing pattern for `enable_embeddings`, `enable_summaries`, `enable_vocab_clusters`.

### 9. MCP Server (`apps/daemon/src/mcp.ts`)

Guard slicing similar to context.ts (around line 77) — currently uses `enable_embeddings` only.

---

## Report

- **Tool calls**: 5
- **Files read**: 5
- **Key findings**:
  - **9 files need modification**: schema.ts, connection.ts, queries.ts, types.ts, context.ts, server.ts (daemon), api.ts (dashboard), Repos.tsx, RepoDetail.tsx
  - **Pattern follows existing toggles**: `enable_embeddings`, `enable_summaries`, `enable_vocab_clusters` are the reference implementation
  - **Guard location**: `sliceContext` is called in `context.ts:267-270` — wrap in `repo?.enable_code_slicing !== 0` check
  - **Default should be enabled** (default(1)) — code slicing is a core Phase 3 feature, not an optional enrichment
