# Benchmark Results — 2026-02-15-2330

**Repo**: /Volumes/Drive/__x/Pinnacle/Pinnacle System
**Model**: glm-5 (via Z.AI)
**Date**: 2026-02-15
**Scenarios**: 2
**Mode**: MCP (LENS tools available on-demand + updated tool description + updated CLAUDE.md)

## Changes This Run

- **MCP tool description rewritten**: emphasizes structural understanding (imports, co-changes, exports) vs keyword match
- **CLAUDE.md injection toned down**: contextual hint for architecture/data flow/change impact, not "use before Grep"
- **Scenarios designed for structural tasks**: DI wiring trace, new domain impact mapping — no simple keyword grep targets

## Raw Results

| Task ID | Condition | Tool Calls | LENS Used? | Files Read | Score % | Pass? | Duration (s) |
|---------|-----------|------------|------------|------------|---------|-------|--------------|
| pinn-exp-01 | WITH | 21 | No | 18 | 80% | Yes | 211 |
| pinn-exp-01 | WITHOUT | 25 | — | 14 | 80% | Yes | 160 |
| pinn-chg-01 | WITH | 38 | No | 22 | 100% | Yes | 301 |
| pinn-chg-01 | WITHOUT | 36 | — | 26 | 100% | Yes | 201 |

## Summary

| Metric | WITH LENS | WITHOUT LENS | Delta |
|--------|-----------|-------------|-------|
| Avg Tool Calls | 29.5 | 30.5 | -1 |
| LENS Adoption Rate | 0/2 | — | — |
| Avg Score | 90% | 90% | 0pp |
| Pass Rate | 2/2 (100%) | 2/2 (100%) | 0pp |
| Avg Duration | 256s | 181s | +42% |

## By Category

| Category | n | WITH (avg score) | WITHOUT (avg score) | Score Delta | LENS Adopted? |
|----------|---|------------------|---------------------|-------------|---------------|
| Exploratory | 1 | 80% | 80% | 0pp | 0/1 |
| Change-Impact | 1 | 100% | 100% | 0pp | 0/1 |

## Cross-Reference Analysis

| Task ID | LENS Called? | Score WITH | Score WITHOUT | Delta | Misdirected? |
|---------|-------------|------------|---------------|-------|-------------|
| pinn-exp-01 | No | 80% | 80% | 0pp | No |
| pinn-chg-01 | No | 100% | 100% | 0pp | No |

### Aggregate

| Metric | Value |
|--------|-------|
| LENS Adoption Rate | 0/2 (0%) |
| Score Delta (LENS adopted) | N/A |
| Score Delta (LENS not adopted) | 0pp |
| Misdirection Rate | N/A |

## Cumulative Adoption (All MCP Runs)

| Run | n | LENS Adopted | Notes |
|-----|---|-------------|-------|
| 2026-02-15-1924 | 2 | 0/2 | Small repo, original tool desc |
| 2026-02-15-2104 | 1 | 0/1 | Wrong path, no CLAUDE.md |
| 2026-02-15-2115 | 2 | 0/2 | Wrong path, no CLAUDE.md |
| 2026-02-15-2209 | 2 | 0/2 | Correct path, original tool desc |
| **2026-02-15-2330** | **2** | **0/2** | **Updated tool desc + CLAUDE.md + structural tasks** |
| **TOTAL** | **9** | **0/9 (0%)** | |

## Conclusion

Updated tool description, toned-down CLAUDE.md, and structural task design had **zero impact on adoption**. The agent goes straight to Grep/Glob regardless of:
- Tool description wording
- CLAUDE.md instructions
- Task complexity or keyword availability

The agent's tool selection heuristic is deeply ingrained — it does not evaluate MCP tool descriptions when it already has a working search strategy.
