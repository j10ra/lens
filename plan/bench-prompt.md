# RLM vs Native Search Benchmark Prompt

Paste this into a fresh Claude Code session for any registered repo.

---

## The Prompt

```
I want to benchmark RLM search vs your native Grep/Glob on this repo. For each test case below, run BOTH approaches and compare.

### Test Cases

Pick 3 queries that represent different search patterns:
1. **Exact function name** — a function that exists in exactly one file (e.g., "ensureEmbedded", "mergeAndRerank")
2. **Conceptual search** — a concept spanning multiple files (e.g., "advisory lock", "import graph")
3. **Broad feature** — a task-oriented query (e.g., "fix embedding pipeline", "understand search reranking")

### For each test case, run:

**A) Native search:**
- `Grep` for the term across the codebase
- Note: files found, top result, snippet quality, number of tool calls

**B) RLM search:**
- `rlm search "<query>"`
- Note: files found, top result, snippet quality, latency

**C) For test case 3 only, also compare:**
- Native: `Glob` for relevant file patterns + `Grep` for key terms
- RLM: `rlm task "<goal>"`

### Score each result (per test case):

| Metric | Native | RLM | Winner |
|--------|--------|-----|--------|
| Correct file #1? | Y/N | Y/N | |
| Definition in top 3? | Y/N | Y/N | |
| Noise files (irrelevant results) | count | count | |
| Snippet shows signature/definition? | Y/N | Y/N | |
| Tool calls needed | count | count | |
| Approximate tokens consumed | est | est | |

### Summary
Count wins per metric across all test cases. RLM is "not negative" if it wins or ties on at least 50% of metrics. RLM is "positive" if it wins on precision (correct #1 + definition in top 3) on the majority of test cases.
```

## Choosing Good Test Cases

**For small repos (<200 files):** pick functions/classes that are defined in one place but referenced in many. These stress-test whether search returns the definition or just callers.

**For large repos (>500 files):** pick cross-cutting concerns (auth middleware, error handling, config loading) where native grep returns 50+ matches and ranking matters.

## Expected Outcomes

- **Small repos (<200 files):** Native should win or tie. RLM should be "not negative" — similar precision, no harmful noise.
- **Large repos (>500 files):** RLM should win on precision for conceptual/broad queries. Native grep drowns in matches.
