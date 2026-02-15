I now have a complete picture. Let me summarize the changes needed.

## Summary: Adding `enable_code_slicing` Feature Toggle

### Schema Changes

**1. `packages/engine/src/db/schema.ts`** — Add column to `repos` table:
```typescript
enable_code_slicing: integer("enable_code_slicing").notNull().default(1),
```
Add after line 28, alongside existing toggles.

### Query Changes

**2. `packages/engine/src/db/queries.ts`** — Update `updateProFeatures` function (line 133-143):
- Add `enable_code_slicing?: number` to the `flags` parameter type
- Add conditional setter for the new field

### Context Pipeline Changes

**3. `packages/engine/src/context/context.ts`** — Guard slicing call (lines 267-270):
```typescript
const repo = repoQueries.getById(db, repoId);
// ...
trace?.step("sliceContext");
const { sliceContext: sliceCtx } = await import("./slicer");
const slices = repo?.enable_code_slicing !== 0 
  ? sliceCtx(db, repoId, snippets, parsed.kind) 
  : new Map();
trace?.end("sliceContext", `${slices.size} slices`);
```

### Daemon API Changes

**4. `apps/daemon/src/server.ts`** — Update settings endpoint (lines 1027-1048):
- Add `enable_code_slicing?: boolean` to request body type
- Add flag mapping: `if (body.enable_code_slicing !== undefined) flags.enable_code_slicing = body.enable_code_slicing ? 1 : 0;`

### Dashboard Changes

**5. `apps/dashboard/src/lib/api.ts`** — Update `repos()` response type (line 41-43):
- Add `enable_code_slicing: number;` to repo type

**6. `apps/dashboard/src/lib/api.ts`** — Update `updateRepoSettings()` (lines 171-179):
- Add `enable_code_slicing?: boolean` to settings param type

**7. `apps/dashboard/src/pages/RepoDetail.tsx`** — Add UI control in `OverviewTab`:
- Add switch for code slicing in the Enrichment card (around line 679)
- Add mutation handler for the new toggle

**8. `apps/dashboard/src/pages/Repos.tsx`** — If there's a settings mutation here, update it too.

### Migration

**9. Database migration** — For existing databases, run:
```sql
ALTER TABLE repos ADD COLUMN enable_code_slicing INTEGER NOT NULL DEFAULT 1;
```

This can be done via `mcp__supabase__apply_migration` if using Supabase, or as an ad-hoc SQL execution for SQLite (engine uses SQLite locally, migration happens automatically on schema change since better-sqlite3 doesn't enforce schema migrations).

---

## Report

- **Tool calls**: 10
- **Files read**: 7
- **Key findings**:
  - Feature toggles stored as SQLite integer columns (0/1) in `repos` table
  - `updateProFeatures()` handles toggle updates in queries.ts
  - Slicing called unconditionally in context.ts:267-270 — needs guard
  - Dashboard UI uses Switch components with mutation callbacks
  - Settings route at `/api/dashboard/repos/:id/settings` wires PATCH to `updateProFeatures()`
