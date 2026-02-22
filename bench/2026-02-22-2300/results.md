# Benchmark Results — 2026-02-22-2300

**Repo**: /Volumes/Drive/__x/RLM
**Model**: glm-5 (via Z.AI)
**Date**: 2026-02-22
**Scenarios**: 12
**Changes vs previous run (2026-02-22-2135)**: Scaled from 2 → 12 scenarios (3 per category), same ToolSearch discovery + improved MCP descriptions

## Raw Results

| Task ID | Condition | Tool Calls | LENS Used? | Files Read | Score % | Pass? | Duration (s) |
|---------|-----------|------------|------------|------------|---------|-------|--------------|
| rlm-exp-01 | WITH | 7 | No | 7 | 100% | Yes | 418 |
| rlm-exp-01 | WITHOUT | 7 | — | 6 | 100% | Yes | 115 |
| rlm-exp-02 | WITH | 5 | Yes (lens_grep) | 4 | 90% | Yes | 160 |
| rlm-exp-02 | WITHOUT | 6 | — | 4 | 90% | Yes | 302 |
| rlm-exp-03 | WITH | 10 | Yes (lens_graph) | 8 | 100% | Yes | 400 |
| rlm-exp-03 | WITHOUT | 11 | — | 11 | 100% | Yes | 354 |
| rlm-dbg-01 | WITH | 9 | No | 6 | 90% | Yes | 267 |
| rlm-dbg-01 | WITHOUT | 10 | — | 8 | 100% | Yes | 473 |
| rlm-dbg-02 | WITH | 16 | Yes (lens_grep) | 10 | 90% | Yes | 592 |
| rlm-dbg-02 | WITHOUT | 12 | — | 7 | 80% | Yes | 191 |
| rlm-dbg-03 | WITH | 3 | Yes (lens_grep) | 1 | 100% | Yes | 161 |
| rlm-dbg-03 | WITHOUT | 4 | — | 3 | 100% | Yes | 108 |
| rlm-chg-01 | WITH | 14 | Yes (lens_grep, graph_neighbors) | 8 | 100% | Yes | 154 |
| rlm-chg-01 | WITHOUT | 13 | — | 9 | 100% | Yes | 396 |
| rlm-chg-02 | WITH | 9 | Yes (lens_grep) | 9 | 100% | Yes | 247 |
| rlm-chg-02 | WITHOUT | 12 | — | 11 | 100% | Yes | 417 |
| rlm-chg-03 | WITH | 8 | No | 6 | 100% | Yes | 215 |
| rlm-chg-03 | WITHOUT | 12 | — | 9 | 90% | Yes | 133 |
| rlm-tgt-01 | WITH | 4 | No | 2 | 40% | No | 161 |
| rlm-tgt-01 | WITHOUT | 6 | — | 5 | 70% | No | 299 |
| rlm-tgt-02 | WITH | 3 | Yes (lens_grep) | 1 | 60% | No | 187 |
| rlm-tgt-02 | WITHOUT | 4 | — | 1 | 60% | No | 116 |
| rlm-tgt-03 | WITH | 6 | Yes (lens_grep) | 4 | 100% | Yes | 160 |
| rlm-tgt-03 | WITHOUT | 8 | — | 4 | 65% | No | 341 |

## Summary

| Metric | WITH LENS | WITHOUT LENS | Delta |
|--------|-----------|-------------|-------|
| Avg Tool Calls | 7.8 | 8.8 | -1.0 |
| LENS Adoption Rate | 8/12 (67%) | — | — |
| Avg Score | 89% | 88% | +1pp |
| Pass Rate | 10/12 (83%) | 9/12 (75%) | +8pp |
| Avg Duration | 260s | 270s | -4% |

## By Category

| Category | n | WITH (avg score) | WITHOUT (avg score) | Score Delta | LENS Adopted? |
|----------|---|------------------|---------------------|-------------|---------------|
| Exploratory | 3 | 97% | 97% | 0pp | 2/3 (lens_grep, lens_graph) |
| Debug | 3 | 93% | 93% | 0pp | 2/3 (lens_grep) |
| Change-Impact | 3 | 100% | 97% | +3pp | 2/3 (lens_grep, graph_neighbors) |
| Targeted | 3 | 67% | 65% | +2pp | 2/3 (lens_grep) |

## Cross-Reference Analysis

| Task ID | lens_grep | lens_graph | lens_graph_neighbors | Score WITH | Score WITHOUT | Delta | Misdirected? |
|---------|-----------|------------|---------------------|------------|---------------|-------|-------------|
| rlm-exp-01 | No | No | No | 100% | 100% | 0pp | No |
| rlm-exp-02 | Yes | No | No | 90% | 90% | 0pp | No |
| rlm-exp-03 | No | Yes | No | 100% | 100% | 0pp | No |
| rlm-dbg-01 | No | No | No | 90% | 100% | -10pp | No (no LENS) |
| rlm-dbg-02 | Yes | No | No | 90% | 80% | +10pp | No |
| rlm-dbg-03 | Yes | No | No | 100% | 100% | 0pp | No |
| rlm-chg-01 | Yes | No | Yes | 100% | 100% | 0pp | No |
| rlm-chg-02 | Yes | No | No | 100% | 100% | 0pp | No |
| rlm-chg-03 | No | No | No | 100% | 90% | +10pp | No (no LENS) |
| rlm-tgt-01 | No | No | No | 40% | 70% | -30pp | No (no LENS) |
| rlm-tgt-02 | Yes | No | No | 60% | 60% | 0pp | No |
| rlm-tgt-03 | Yes | No | No | 100% | 65% | +35pp | No |

### Aggregate

| Metric | Value |
|--------|-------|
| lens_grep Adoption Rate | 7/12 (58%) |
| lens_graph Adoption Rate | 1/12 (8%) |
| lens_graph_neighbors Adoption Rate | 1/12 (8%) |
| Any LENS Adoption Rate | 8/12 (67%) |
| Score Delta (LENS adopted, n=8) | +5.6pp |
| Score Delta (LENS not adopted, n=4) | -7.5pp |
| Misdirection Rate | 0/8 (0%) |

## Duration Analysis

| Task ID | WITH (s) | WITHOUT (s) | LENS Used? | Duration Delta |
|---------|----------|-------------|------------|----------------|
| rlm-exp-02 | 160 | 302 | Yes | **-47%** |
| rlm-chg-01 | 154 | 396 | Yes | **-61%** |
| rlm-chg-02 | 247 | 417 | Yes | **-41%** |
| rlm-tgt-03 | 160 | 341 | Yes | **-53%** |
| rlm-dbg-02 | 592 | 191 | Yes | +210% |
| rlm-dbg-03 | 161 | 108 | Yes | +49% |
| rlm-exp-03 | 400 | 354 | Yes | +13% |
| rlm-tgt-02 | 187 | 116 | Yes | +61% |

### Duration by LENS Adoption

| Group | Avg WITH (s) | Avg WITHOUT (s) | Delta |
|-------|-------------|----------------|-------|
| LENS adopted (n=8) | 258 | 278 | -7% |
| LENS not adopted (n=4) | 265 | 255 | +4% |

## Comparison vs Previous Run (2026-02-22-2135)

| Metric | Previous (n=2) | Current (n=12) |
|--------|---------------|----------------|
| LENS Adoption | 2/2 (100%) | 8/12 (67%) |
| Avg Score WITH | 88% | 89% |
| Avg Score WITHOUT | 88% | 88% |
| Score Delta | 0pp | +1pp |
| Pass Rate WITH | 1/2 | 10/12 (83%) |
| Pass Rate WITHOUT | 1/2 | 9/12 (75%) |

## Observations

1. **67% LENS adoption** (8/12) — Down from 100% at n=2. Four tasks did NOT adopt LENS despite ToolSearch hint. Agent sometimes satisfied ToolSearch then switched to built-in Grep/Read. Adoption is voluntary, not guaranteed.

2. **+5.6pp score delta when LENS adopted** — Two standout wins: rlm-dbg-02 (+10pp, lens_grep helped trace span data flow) and rlm-tgt-03 (+35pp, lens_grep found all data file locations that WITHOUT missed).

3. **Zero misdirection** — No task where LENS led the agent to wrong files or worse scores. 0/8 adopted tasks had negative score deltas.

4. **lens_grep dominant** — 7/8 LENS-adopted tasks used lens_grep. Only 1 used lens_graph, 1 used lens_graph_neighbors. The description rewrite worked for lens_grep but lens_graph needs stronger adoption signals.

5. **Change-Impact category best** — 100% WITH vs 97% WITHOUT (+3pp). LENS excelled at mapping modification impact (chg-01 used both lens_grep and lens_graph_neighbors).

6. **Targeted category weakest** — Both conditions scored poorly (67% WITH, 65% WITHOUT). Tasks asking for specific constants/values need deeper file reading than either approach provides reliably.

7. **Duration mixed** — Overall -4% faster WITH. Some LENS tasks dramatically faster (chg-01 -61%, tgt-03 -53%) while others slower (dbg-02 +210%). MCP roundtrip adds latency but reduces total Read calls when results are informative.

8. **Higher pass rate WITH** — 10/12 vs 9/12. Extra pass was rlm-tgt-03 where lens_grep discovered all data file locations (100%) that WITHOUT partially missed (65%).

9. **Sample size** — n=12 gives better signal than n=2 but still insufficient for statistical significance. Category-level conclusions (n=3) are directional only. Recommend n=24+ for gate-level confidence.
