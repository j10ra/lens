Boss, found both values in `packages/engine/src/grep/scorer.ts`:

## TF-IDF Field Weights (lines 11-19)

| Field | Weight |
|-------|--------|
| `fileName` | **4.0** |
| `symbols` | **3.0** |
| `exports` | **2.5** |
| `internals` | **1.5** |
| `dirPath` | **2.0** |
| `docstring` | **1.0** |
| `sections` | **1.0** |

## Hub Threshold (line 8)

```typescript
const HUB_THRESHOLD = 5;
```

Files with `indegree >= 5` (imported by 5+ other files) are classified as hubs.

---

## Report

- **Tool calls**: 4
- **Tools used**: ToolSearch, Grep, Read
- **Files read**: 1
- **Files used**: /Volumes/Drive/__x/RLM/packages/engine/src/grep/scorer.ts
- **Key findings**:
  - TF-IDF scoring prioritizes fileName (4x) > symbols (3x) > exports (2.5x) > internals (1.5x) > dirPath (2x) > docstring/sections (1x)
  - Hub threshold is 5 — files imported by 5+ others get `isHub: true` flag
  - All constants centralized at top of `scorer.ts` for easy tuning
