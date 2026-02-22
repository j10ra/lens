Found both constants in `packages/engine/src/grep/scorer.ts`.

**TF-IDF Field Weights** (lines 11-19):
```typescript
const FIELD_WEIGHTS = {
  fileName: 4,      // highest - filename matches are most important
  symbols: 3,       // symbol declarations
  exports: 2.5,     // exported names
  internals: 1.5,   // internal symbols
  dirPath: 2,       // directory path
  docstring: 1,     // documentation text
  sections: 1,      // markdown sections
}
```

**Hub Threshold** (line 8):
```typescript
const HUB_THRESHOLD = 5;  // files with ≥5 importers marked as hubs
```

## Report

- **Tool calls**: 3
- **Tools used**: ToolSearch, mcp__lens__lens_grep, Read
- **Files read**: 1
- **Files used**: packages/engine/src/grep/scorer.ts
- **Key findings**:
  - `HUB_THRESHOLD = 5` — files with indegree ≥ 5 are classified as hubs
  - TF-IDF weights prioritize `fileName` (4x), `symbols` (3x), `exports` (2.5x), `dirPath` (2x)
  - Lower weights for `internals` (1.5x), `docstring` and `sections` (1x each)
