# Benchmarks & Findings

Controlled A/B benchmarks across multiple repos (32-2000+ files) measuring what LENS does for AI agents.

## Methodology

- **WITHOUT** = baseline (LENS tools blocked, standard Grep/Glob/Read only)
- **WITH** = treatment (LENS MCP tools available via `--mcp-config`)
- Identical prompts — the ONLY variable is LENS tool availability
- Agent self-reports: tool calls, tools used, files read, files cited
- Scored against verifiable judge criteria (file paths, class names, config values)
- Model: glm-5 via Z.AI (Claude-equivalent)

### Categories

| Category | Description |
|----------|-------------|
| Exploratory | Understand architecture, trace workflows, map systems |
| Debug | Diagnose a plausible bug, trace error paths |
| Change-Impact | Map files affected by a hypothetical change |
| Targeted | Find a specific class, constant, or config value |

## Results

### Pre-injection mode (context pack in system prompt)

| Repo | Files | n | Score WITH | Score WITHOUT | Delta |
|------|-------|---|-----------|---------------|-------|
| Pinnacle (unfamiliar, C#) | 2000+ | 12 | 74.2% | 58.3% | **+15.8pp** |
| RLM (own repo, TS) | 200+ | 12 | 69.2% | 77.1% | -7.9pp |

**Finding**: LENS helps most on unfamiliar repos where the agent doesn't know the codebase structure. On repos you work in daily, the overhead can hurt.

### MCP mode (agent calls LENS on-demand)

| Run | Repo | n | LENS Adopted | Score Delta |
|-----|------|---|-------------|-------------|
| 2026-02-15-1924 | copilot-survey-engine (32 files) | 2 | 0/2 | 0pp |
| 2026-02-15-2104 | Pinnacle (wrong path) | 1 | 0/1 | 0pp |
| 2026-02-15-2115 | Pinnacle (wrong path) | 2 | 0/2 | 0pp |
| 2026-02-15-2209 | Pinnacle (correct path) | 2 | 0/2 | 0pp |
| 2026-02-15-2330 | Pinnacle (updated desc) | 2 | 0/2 | 0pp |
| **Total** | | **9** | **0/9 (0%)** | **0pp** |

**Finding**: Agents never called LENS MCP tools despite them being available and CLAUDE.md instructions being present. They default to Grep/Glob regardless of tool descriptions.

## What works

- **+15.8pp on unfamiliar repos** — pre-injected context packs improve accuracy when agents explore codebases they've never seen
- **Sub-second queries** — ~10ms cached, under 1s cold for the full 7-stage pipeline
- **Co-change catches what grep misses** — git history surfaces files that always change together (service + test + migration) with no keyword overlap
- **Import chain traversal** — 2-hop dependency walking finds structural relationships flat search can't

## What we learned

- **Agents are good at grep** — on tasks with obvious keywords, agents score equally well with or without LENS
- **MCP tool adoption is hard** — 0/9 across all runs. Agents default to built-in tools regardless of descriptions or instructions. This is a fundamental limitation of current agent tool selection
- **Value scales with unfamiliarity** — LENS helps most when you don't know where to start. On daily-driver repos, you already know the right files

## Raw data

All benchmark outputs, scoring, and timing data are in [`bench/`](../bench/).

Each run directory contains:
- `scenarios.md` — test prompts and judge criteria
- `runs/<task>-with.md` / `runs/<task>-without.md` — raw agent outputs
- `runs/timing.csv` — execution times
- `results.md` — scored results and cross-reference analysis
