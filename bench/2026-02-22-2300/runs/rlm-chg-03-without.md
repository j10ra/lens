Boss, I've analyzed the full trace pipeline. Here's the complete breakdown:

## Current State

- **Schema**: `spans` table has `error_message` column, but `traces` table has NO error tracking
- **TraceStore**: `queryTraces()` only filters by `source`, doesn't know about errors
- **Dashboard**: Shows error status per-span (red bar in waterfall), but trace list has no error indicator or filter

---

## Required Changes

### Backend (packages/core)

**1. Schema** (`packages/core/src/schema.ts`)
```ts
export const traces = sqliteTable("traces", {
  // ...existing columns...
  hasError: integer("has_error", { mode: "boolean" }).default(false), // ADD
});
```

**2. Migration** 
```bash
pnpm --filter @lens/core drizzle-kit generate
```

**3. TraceStore** (`packages/core/src/trace-store.ts`)

In `flush()` upsert, track if any span has error:
```ts
// In traceMap building loop
hasError: existing?.hasError || !!s.errorMessage
```

Update `queryTraces()` to support error filter:
```ts
queryTraces(limit?: number, sources?: string[], hasError?: boolean)
```

Add `has_error = ?` to WHERE clause when filtering.

**4. API Route** (`apps/daemon/src/routes/traces.ts`)
```ts
const hasError = c.req.query("error"); // "true" | "false" | undefined
const traces = getTraceStore().queryTraces(limit, sources, hasError === "true" ? true : undefined);
```

---

### Frontend (apps/dashboard)

**1. API Client** (`apps/dashboard/src/lib/api.ts`)
```ts
traces: (limit?: number, sources?: string[], hasError?: boolean) => {
  // Add error param to query string
  if (hasError) qs.set("error", "true");
}
```

**2. Query Hook** (`apps/dashboard/src/queries/use-traces.ts`)
```ts
export function useTraces(sources?: string[], hasError?: boolean) {
  return useQuery({
    queryKey: ["traces", sources, hasError],
    queryFn: () => api.traces(undefined, sources, hasError),
  });
}
```

**3. UI** (`apps/dashboard/src/pages/Traces.tsx`)

Add error filter toggle alongside source badges:
```tsx
const [showErrorsOnly, setShowErrorsOnly] = useState(false);
// ...
<Badge 
  variant={showErrorsOnly ? "destructive" : "outline"}
  onClick={() => setShowErrorsOnly(!showErrorsOnly)}
>
  errors only
</Badge>
```

Add error indicator column in trace list:
```tsx
{trace.has_error && (
  <Badge variant="outline" className="border-destructive text-destructive">
    error
  </Badge>
)}
```

---

## Summary Table

| Layer | File | Change |
|-------|------|--------|
| Schema | `core/schema.ts` | Add `hasError` column |
| Migration | `core/drizzle/` | Generate new migration |
| Store | `core/trace-store.ts` | Track error in flush, add filter param |
| Route | `daemon/routes/traces.ts` | Parse `error` query param |
| API | `dashboard/lib/api.ts` | Pass error filter |
| Hook | `dashboard/queries/use-traces.ts` | Add hasError param |
| UI | `dashboard/pages/Traces.tsx` | Add filter toggle + indicator |

---

## Report

- **Tool calls**: 12
- **Tools used**: ToolSearch, Read, Glob, Grep, Bash
- **Files read**: 9
- **Files used**: `packages/core/src/trace-store.ts`, `packages/core/src/schema.ts`, `apps/daemon/src/routes/traces.ts`, `apps/dashboard/src/lib/api.ts`, `apps/dashboard/src/queries/use-traces.ts`, `apps/dashboard/src/pages/Traces.tsx`, `apps/dashboard/src/components/TraceWaterfall.tsx`, `apps/dashboard/src/store/trace-store.ts`, `packages/core/drizzle/0002_talented_bloodscream.sql`, `packages/core/drizzle/meta/_journal.json`
- **Key findings**:
  - Error data exists at span level (`error_message` in `spans` table) but not propagated to trace level
  - `TraceStore.queryTraces()` needs new `hasError` param and SQL WHERE clause
  - Dashboard already renders errors in waterfall view, just needs list-level visibility
  - Migration system uses drizzle-kit with auto-generated SQL files
