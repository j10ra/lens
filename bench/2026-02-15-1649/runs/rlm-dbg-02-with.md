Found it. The token cap logic is in `formatter.ts`. Here's what I found:

## Token Cap Logic Analysis

### Constants
- **`TOKEN_CAP = 2000`** (line 3) — Hard limit for output tokens

### Token Estimation
- **`estimateTokens(s)`** (lines 5-7) — Uses a simple heuristic: `Math.ceil(s.length / 4)` (1 token ≈ 4 characters)

### Main Entry Point
- **`formatContextPack(data)`** (lines 410-434) — The entry point that:
  1. Filters files by score relevance (15% threshold of top score)
  2. Routes to query-kind-specific formatters (`symbol`, `error_message`, `stack_trace`, `natural`)
  3. **Checks token cap** (line 429): `if (estimateTokens(output) > TOKEN_CAP)`
  4. Calls `progressiveStrip()` if exceeded

### Progressive Stripping (lines 328-391)
When token cap is exceeded, `progressiveStrip()` applies **6 sequential degradation steps**:

| Step | Action | Token Cost Reduced |
|------|--------|-------------------|
| 1 | Strip all code slices (fenced ``` blocks) | Highest |
| 2 | Truncate co-change lists (keep only top 1) | Medium |
| 3 | Drop entire "## Tests" section | Medium |
| 4 | Remove import arrow lines with `\|` | Low |
| 5 | Reduce to top 5 files only | Medium-High |
| 6 | Drop purpose summaries (`— <purpose>`) | Low |

**Each step re-checks the token cap** — stripping stops as soon as `estimateTokens() <= TOKEN_CAP`.

### What Happens When Exceeded
1. **Code snippets disappear first** — All fenced code blocks are stripped, leaving only file metadata
2. **Co-change context is truncated** — Only the single most frequent co-change partner shown
3. **Test files vanish** — Entire Tests section dropped
4. **Import details simplified** — Multi-direction import arrows filtered out
5. **File list shrinks** — Only top 5 ranked files retained
6. **Purpose summaries removed** — The `— <purpose>` after file labels disappears last

### Key Insight
The progressive stripping is **lossy but graceful** — it preserves structure (headers, file paths, exports) while sacrificing detailed context (code, tests, purpose). This ensures the pack always fits within 2000 tokens but may lose critical information for complex queries.

---

## Report

- **Tool calls**: 0
- **Files read**: 1
- **Key findings**:
  - Token cap is **2000 tokens** (`TOKEN_CAP` constant at line 3)
  - Estimation uses `length / 4` heuristic (not a real tokenizer)
  - **6-step progressive stripping** activates when exceeded: code slices → co-changes → tests → imports → files (top 5) → purposes
  - Stripping is **iterative** — each step re-checks cap, stops early if under
  - **No truncation** — output is never cut mid-line, only whole sections removed
