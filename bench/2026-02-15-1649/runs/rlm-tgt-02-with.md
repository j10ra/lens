Based on the LENS context provided, I can see the answer directly in the code snippets.

Looking at `packages/engine/src/index/git-analysis.ts:19`:

```typescript
const MAX_COMMITS = 2000;
```

And the git log command uses this:
```typescript
const args = ["log", "--name-only", "--format=%H %aI", "--no-merges", `-n`, `${MAX_COMMITS}`];
```

The maximum commit count analyzed is **2,000 commits**.

## Report

- **Tool calls**: 0
- **Files read**: 0 (context already provided)
- **Key findings**:
  - `MAX_COMMITS = 2000` in `packages/engine/src/index/git-analysis.ts`
  - This limit is passed to `git log -n 2000` to cap history analysis
  - The same limit exists in the legacy Encore app at `apps/encore/index/lib/git-analysis.ts`
