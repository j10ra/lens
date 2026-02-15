# Benchmark Results — 2026-02-15-2104

**Repo**: /Volumes/Drive/__x/Pinnacle
**Model**: glm-5 (via Z.AI)
**Date**: 2026-02-15
**Scenarios**: 1 (smoke test — pipeline validation on large repo)
**Mode**: MCP (LENS tools available on-demand in WITH condition)

## Raw Results

| Task ID | Condition | Tool Calls | LENS Used? | Files Read | Score % | Pass? | Duration (s) |
|---------|-----------|------------|------------|------------|---------|-------|--------------|
| pinn-exp-01 | WITH | 12 | No | 6 | 80% | Yes | 119 |
| pinn-exp-01 | WITHOUT | 10 | — | 5 | 80% | Yes | 126 |

## Summary

| Metric | WITH LENS | WITHOUT LENS | Delta |
|--------|-----------|-------------|-------|
| Avg Tool Calls | 12 | 10 | +2 |
| LENS Adoption Rate | 0/1 | — | — |
| Avg Score | 80% | 80% | 0pp |
| Pass Rate | 1/1 (100%) | 1/1 (100%) | 0pp |
| Avg Duration | 119s | 126s | -6% |

## By Category

| Category | n | WITH (avg score) | WITHOUT (avg score) | Score Delta | LENS Adopted? |
|----------|---|------------------|---------------------|-------------|---------------|
| Exploratory | 1 | 80% | 80% | 0pp | 0/1 |

## Cross-Reference Analysis

| Task ID | LENS Called? | Score WITH | Score WITHOUT | Delta | Misdirected? |
|---------|-------------|------------|---------------|-------|-------------|
| pinn-exp-01 | No | 80% | 80% | 0pp | No |

### Aggregate

| Metric | Value |
|--------|-------|
| LENS Adoption Rate | 0/1 (0%) |
| Score Delta (LENS adopted) | N/A (no adoption) |
| Score Delta (LENS not adopted) | 0pp |
| Misdirection Rate | N/A |

## Analysis

### LENS was not adopted

The agent did not call any `mcp__lens__*` tools despite them being available. Both conditions used the same tools (Glob, Grep, Read) and found nearly identical files. Both missed the same criterion (auth scheme).

### Possible reasons for non-adoption

1. **Agent strategy**: The agent went straight to searching for "Estimate" via Grep/Glob — a direct search that works well for a targeted trace task
2. **Tool description**: `get_context` says "prefer this over Grep/Glob when searching for files relevant to a task across the codebase" — but the agent had a clear search term ("Estimate") making Grep the obvious first choice
3. **Single scenario**: n=1 is too small to draw conclusions. Exploratory tasks that require broader understanding (not targeted tracing) may trigger LENS adoption

### Pipeline validation

- MCP config loaded correctly (WITH had LENS tools available)
- Self-report format captured tools used by name (no LENS priming)
- Scoring, timing, and results generation all functional on large repo
- Sanity check passed: non-adopted WITH ≈ WITHOUT (0pp delta)
