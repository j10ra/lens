Now I have the complete picture. Here's the analysis:

## Required Changes

### Backend (packages/core + apps/daemon)

**1. Schema Migration** (`packages/core/src/schema.ts`)
```ts
// Add to traces table:
hasError: integer("has_error", { mode: "boolean" }).default(false),
```

**2. TraceStore** (`packages/core/src/trace-store.ts`)

- **flush()** — When upserting traces, compute `has_error` from any span with `errorMessage`:
```ts
// In flush(), build error tracking into traceMap
const hasError = spans.some(s => s.errorMessage);
```

- **queryTraces()** — Add `hasError?: boolean` parameter:
```ts
queryTraces(limit = 50, sources?: string[], hasError?: boolean)
```

**3. Route** (`apps/daemon/src/routes/traces.ts`)
```ts
// Add error query param parsing
const errorParam = c.req.query("error"); // "true" | "false" | undefined (all)
const hasError = errorParam === "true" ? true : errorParam === "false" ? false : undefined;
```

**4. Migration file** — Create new drizzle migration:
```bash
pnpm --filter @lens/core drizzle-kit generate
```

### Frontend (apps/dashboard)

**5. API client** (`apps/dashboard/src/lib/api.ts`)
```ts
traces: (limit?: number, sources?: string[], hasError?: boolean) => {
  // Add hasError to query string
}
```

**6. Query hook** (`apps/dashboard/src/queries/use-traces.ts`)
```ts
export function useTraces(sources?: string[], hasError?: boolean) {
  return useQuery<TraceRow[]>({
    queryKey: ["traces", sources, hasError],
    queryFn: () => api.traces(undefined, sources, hasError),
  });
}
```

**7. Traces page** (`apps/dashboard/src/pages/Traces.tsx`)
```tsx
// Add error filter state alongside source filters
const [errorFilter, setErrorFilter] = useState<'all' | 'error' | 'ok'>('all');

// Add toggle UI (3-state: all/error/ok)
<div className="flex gap-1">
  <Badge onClick={() => setErrorFilter('all')}>All</Badge>
  <Badge onClick={() => setErrorFilter('error')}>Errors</Badge>
  <Badge onClick={() => setErrorFilter('ok')}>OK</Badge>
</div>
```

**8. Visual indicator** — Show error badge in trace row when `has_error = true`

### Summary Table

| Layer | File | Change |
|-------|------|--------|
| Schema | `packages/core/src/schema.ts` | Add `hasError: integer("has_error", { mode: "boolean" })` |
| Store | `packages/core/src/trace-store.ts:110-124` | Set `has_error` during flush; add filter param to `queryTraces()` |
| Route | `apps/daemon/src/routes/traces.ts:9-15` | Parse `error` query param; pass to store |
| API | `apps/dashboard/src/lib/api.ts:16-22` | Add `hasError` param |
| Query | `apps/dashboard/src/queries/use-traces.ts:33-38` | Pass `hasError` to API; add to queryKey |
| UI | `apps/dashboard/src/pages/Traces.tsx:19-39` | Add error filter state + toggle buttons |
| UI | `apps/dashboard/src/pages/Traces.tsx:91-115` | Show error indicator in table rows |

---

## Report

- **Tool calls**: 8
- **Tools used**: ToolSearch, Glob, Read
- **Files read**: 6
- **Files used**: `packages/core/src/trace-store.ts`, `packages/core/src/schema.ts`, `apps/daemon/src/routes/traces.ts`, `apps/dashboard/src/pages/Traces.tsx`, `apps/dashboard/src/queries/use-traces.ts`, `apps/dashboard/src/lib/api.ts`
- **Key findings**:
  - `spans` table already has `errorMessage` field — can derive trace-level error status
  - `traces` table lacks `has_error` column — needs migration
  - `queryTraces()` only filters by source/limit — needs error param
  - Frontend has source filter pattern that can be replicated for error filtering
  - API client uses URLSearchParams — easy to extend with new params
