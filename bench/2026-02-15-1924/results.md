# Benchmark Results — 2026-02-15-1924

**Repo**: /Volumes/Drive/__x/lens-bench/copilot-survey-engine
**Model**: glm-5 (via Z.AI)
**Date**: 2026-02-15
**Scenarios**: 2 (smoke test — pipeline validation)
**Mode**: MCP (LENS tools available on-demand in WITH condition, no pre-injection)

## Raw Results

| Task ID | LENS? | Tool Calls | LENS Calls | Files Read | Score % | Pass? | Duration (s) |
|---------|-------|------------|------------|------------|---------|-------|--------------|
| cse-exp-01 | Yes | 5 | 0 | 4 | 100% | Yes | 54 |
| cse-exp-01 | No | 4 | 0 | 4 | 100% | Yes | 44 |
| cse-dbg-01 | Yes | 2 | 0 | 1 | 85% | Yes | 40 |
| cse-dbg-01 | No | 3 | 0 | 2 | 85% | Yes | 92 |

## Summary

| Metric | WITH LENS | WITHOUT LENS | Delta |
|--------|-----------|--------------|-------|
| Avg Tool Calls (total) | 3.5 | 3.5 | 0% |
| Avg Non-LENS Tool Calls | 3.5 | 3.5 | 0% |
| Avg LENS Calls | 0 | 0 | — |
| LENS Usage Rate | 0/2 used LENS | — | — |
| Avg Score | 92.5% | 92.5% | 0pp |
| Pass Rate | 2/2 (100%) | 2/2 (100%) | 0pp |
| Avg Duration | 47s | 68s | -31% |

## By Category

| Category | n | WITH (avg score) | WITHOUT (avg score) | Non-LENS Tool Calls Saved % | LENS Used? |
|----------|---|------------------|---------------------|---------------------------|------------|
| Exploratory | 1 | 100% | 100% | -25% (5 vs 4) | 0/1 |
| Debug | 1 | 85% | 85% | 33% (2 vs 3) | 0/1 |

## Analysis

### Critical Finding: LENS MCP tools were NOT used

Despite being available in the WITH condition, the agent chose not to call any `mcp__lens__*` tools in either task. Both conditions produced identical scores.

### Why the agent didn't use LENS

1. **Small repo (32 files)** — the agent can grep/read the entire codebase in 2-5 tool calls. LENS adds no value when the search space is trivial.
2. **Tool description relevance** — the `get_context` description says "prefer this over Grep/Glob when searching for files relevant to a task across the codebase." For a 32-file repo, Grep IS sufficient.
3. **No system prompt nudge** — the copilot-survey-engine repo has no CLAUDE.md mentioning LENS. The agent only sees the tool name and description.

### Pipeline Validation

The pipeline works end-to-end:
- Scenario generation via Z.AI subprocess (pipe mode)
- `run.sh` with MCP mode (`--mcp-config lens-mcp.json`) for WITH condition
- `--disallowed-tools` split between conditions works correctly
- Self-report format captures LENS calls (confirmed 0 when not used)
- Timing, scoring, and results generation all functional

### Implication for Gate Re-Run

This smoke test confirms the pipeline works but reveals that **small repos won't trigger LENS usage**. The real gate run MUST use large repos (1000+ files) like Pinnacle where the agent actually needs help navigating. This validates the user's strategy of segmenting by repo size/familiarity.
