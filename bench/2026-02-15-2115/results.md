# Benchmark Results — 2026-02-15-2115

**Repo**: /Volumes/Drive/__x/Pinnacle
**Model**: glm-5 (via Z.AI)
**Date**: 2026-02-15
**Scenarios**: 2
**Mode**: MCP (LENS tools available on-demand in WITH condition)

## Raw Results

| Task ID | Condition | Tool Calls | LENS Used? | Files Read | Score % | Pass? | Duration (s) |
|---------|-----------|------------|------------|------------|---------|-------|--------------|
| pinn-exp-01 | WITH | 21 | No | 15 | 80% | Yes | 184 |
| pinn-exp-01 | WITHOUT | 17 | — | 15 | 80% | Yes | 254 |
| pinn-tgt-01 | WITH | 4 | No | 4 | 100% | Yes | 47 |
| pinn-tgt-01 | WITHOUT | 6 | — | 1 | 100% | Yes | 55 |

## Summary

| Metric | WITH LENS | WITHOUT LENS | Delta |
|--------|-----------|-------------|-------|
| Avg Tool Calls | 12.5 | 11.5 | +1 |
| LENS Adoption Rate | 0/2 | — | — |
| Avg Score | 90% | 90% | 0pp |
| Pass Rate | 2/2 (100%) | 2/2 (100%) | 0pp |
| Avg Duration | 116s | 155s | -25% |

## By Category

| Category | n | WITH (avg score) | WITHOUT (avg score) | Score Delta | LENS Adopted? |
|----------|---|------------------|---------------------|-------------|---------------|
| Exploratory | 1 | 80% | 80% | 0pp | 0/1 |
| Targeted | 1 | 100% | 100% | 0pp | 0/1 |

## Cross-Reference Analysis

| Task ID | LENS Called? | Score WITH | Score WITHOUT | Delta | Misdirected? |
|---------|-------------|------------|---------------|-------|-------------|
| pinn-exp-01 | No | 80% | 80% | 0pp | No |
| pinn-tgt-01 | No | 100% | 100% | 0pp | No |

### Aggregate

| Metric | Value |
|--------|-------|
| LENS Adoption Rate | 0/2 (0%) |
| Score Delta (LENS adopted) | N/A (no adoption) |
| Score Delta (LENS not adopted) | 0pp |
| Misdirection Rate | N/A |

## Analysis

### LENS was not adopted in either task

Both conditions used identical tool sets (Glob, Grep, Read). No `mcp__lens__*` tools appeared in either WITH output.

### Why

1. **Exploratory (caching)**: Agent searched "cache" via Grep — direct keyword hit. No need for context discovery.
2. **Targeted (DaysInYard)**: Agent searched "DaysInYard" via Grep — instant find. LENS adds no value for direct symbol lookup.

### Observations

- **Parallel execution worked**: Both conditions ran simultaneously. WITH finished faster on both tasks (184s vs 254s for exp, 47s vs 55s for tgt). Duration delta is noise at n=2.
- **Sanity check passes**: Scores equal when LENS not used (0pp delta on both).
- **WITH found more depth on tgt-01**: 4 files read (found secondary implementations in ContainerControlService and SQL) vs 1 file for WITHOUT. Both scored 100% because extra depth wasn't in judge criteria.

### Implication

Both scenarios had clear search terms ("cache", "DaysInYard") making Grep the obvious first tool. LENS adoption likely requires scenarios where the agent doesn't have an obvious keyword — e.g., "how does billing integrate with container tracking?" or "what happens when a user's session expires?" where the search space is ambiguous.
