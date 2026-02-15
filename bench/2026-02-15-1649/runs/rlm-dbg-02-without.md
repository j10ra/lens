Found it. The token cap logic is in `/Volumes/Drive/__x/RLM/packages/engine/src/context/formatter.ts`.

## Token Cap Mechanism

**Location**: `formatter.ts:3`

```typescript
const TOKEN_CAP = 2000;
```

**Token Estimation**: `formatter.ts:5-7`

```typescript
function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}
```

Uses a simple heuristic: ~4 characters per token (rough approximation for English/code).

## What Happens When Exceeded

The `formatContextPack()` function (line 410) orchestrates the process:

1. **Score filtering** (`filterByScoreRelevance`, line 395-406): First removes files below 15% of the top score (keeps top 5 even if below threshold)

2. **Query-kind formatting** (lines 414-427): Renders output using the appropriate template (symbol, error_message, stack_trace, or natural)

3. **Progressive stripping** (`progressiveStrip`, line 328-391): If tokens still exceed 2000, **six-stage progressive degradation** kicks in:

   | Stage | Action | Target |
   |-------|--------|--------|
   | 1 | `stripCodeSlices()` | All fenced code blocks (```...```) |
   | 2 | Truncate co-changes | Keep only first partner per file |
   | 3 | Drop test section | Entire `## Tests` section removed |
   | 4 | Simplify import arrows | Remove lines with `|` (both directions) |
   | 5 | Reduce to top 5 files | Skip numbered items beyond 5 |
   | 6 | Drop purpose summaries | Remove ` — <purpose>` suffixes |

Each stage only runs if the token estimate is still > 2000 after the previous stage. The stripping is **cumulative**, not selective — once code slices are gone, they never return even if later stages free up space.

**Critical behavior**: Code slices (Phase 3 context slicing) are stripped **first** because they're the most expensive. This means rich code context gets nuked before less valuable metadata like co-changes or imports.
