# Benchmark Results — 2026-02-15-2209

**Repo**: /Volumes/Drive/__x/Pinnacle/Pinnacle System (correct git root)
**Model**: glm-5 (via Z.AI)
**Date**: 2026-02-15
**Scenarios**: 2
**Mode**: MCP (LENS tools available on-demand + CLAUDE.md with LENS instructions)

## Raw Results

| Task ID | Condition | Tool Calls | LENS Used? | Files Read | Score % | Pass? | Duration (s) |
|---------|-----------|------------|------------|------------|---------|-------|--------------|
| pinn-exp-01 | WITH | 16 | No | 12 | 30%* | No | 154 |
| pinn-exp-01 | WITHOUT | 15 | — | 11 | 30%* | No | 149 |
| pinn-tgt-01 | WITH | 4 | No | 4 | 100% | Yes | 46 |
| pinn-tgt-01 | WITHOUT | 2 | — | 1 | 100% | Yes | 34 |

*pinn-exp-01 scores low because judge criteria reference `PinnacleIntegratedSystem/` paths which are outside the git root `Pinnacle System/`. Both conditions equally affected — criteria were generated from parent dir.

## Summary

| Metric | WITH LENS | WITHOUT LENS | Delta |
|--------|-----------|-------------|-------|
| Avg Tool Calls | 10 | 8.5 | +1.5 |
| LENS Adoption Rate | 0/2 | — | — |
| Avg Score | 65% | 65% | 0pp |
| Pass Rate | 1/2 (50%) | 1/2 (50%) | 0pp |
| Avg Duration | 100s | 92s | +9% |

## Cross-Reference Analysis

| Task ID | LENS Called? | Score WITH | Score WITHOUT | Delta | Misdirected? |
|---------|-------------|------------|---------------|-------|-------------|
| pinn-exp-01 | No | 30% | 30% | 0pp | No |
| pinn-tgt-01 | No | 100% | 100% | 0pp | No |

### Aggregate

| Metric | Value |
|--------|-------|
| LENS Adoption Rate | 0/2 (0%) |
| Score Delta (LENS adopted) | N/A |
| Score Delta (LENS not adopted) | 0pp |
| Misdirection Rate | N/A |

## Critical Finding: Zero Adoption Despite CLAUDE.md

This run used the correct git root (`Pinnacle System/`) where `CLAUDE.md` exists with explicit LENS instructions:

> "This repo is indexed by LENS. Use the MCP context tool..."

Despite this, the agent chose Grep/Glob/Read for both tasks. LENS tools were confirmed available (verified via tool listing). The agent sees the instructions but doesn't act on them.

### Possible explanations

1. **Pipe mode behavior**: `claude -p` may process CLAUDE.md differently than interactive mode
2. **Prompt dominance**: The task prompt + report suffix may outweigh CLAUDE.md guidance
3. **Tool description**: "Prefer this over Grep/Glob" isn't compelling when the agent already has a search strategy
4. **Keyword availability**: Both tasks had obvious search terms — LENS adds no perceived value

### Criteria quality note

Scenarios were generated from `/Volumes/Drive/__x/Pinnacle` (parent dir) which included `PinnacleIntegratedSystem/`. Running from the git root `Pinnacle System/` made those paths unreachable. Future runs should generate scenarios from the correct repo path.
