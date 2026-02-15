# Benchmark Results — 2026-02-15-1649

**Repos**: /Volumes/Drive/__x/RLM, /Volumes/Drive/__x/Pinnacle/Pinnacle System
**Model**: glm-5 (via Z.AI)
**Date**: 2026-02-15
**Scenarios**: 24 (12 per repo, 4 categories x 3 each)
**Note**: 7/48 runs hit Z.AI 429 rate limit on first attempt; all re-run successfully.

## Raw Results

### RLM (own codebase — LENS indexes this repo)

| Task ID | LENS? | Tool Calls | Files Read | Score % | Pass? | Duration (s) |
|---------|-------|------------|------------|---------|-------|--------------|
| rlm-exp-01 | Yes | 12 | 8 | 100% | Yes | 97 |
| rlm-exp-01 | No | 11 | 11 | 100% | Yes | 122 |
| rlm-exp-02 | Yes | 2 | 2 | 100% | Yes | 61 |
| rlm-exp-02 | No | 7 | 7 | 100% | Yes | 157 |
| rlm-exp-03 | Yes | 4 | 4 | 100% | Yes | 68 |
| rlm-exp-03 | No | 10 | 7 | 85% | Yes | 127 |
| rlm-dbg-01 | Yes | 4 | 4 | 100% | Yes | 162 |
| rlm-dbg-01 | No | 6 | 5 | 100% | Yes | 88 |
| rlm-dbg-02 | Yes | 0 | 1 | 85% | Yes | 79 |
| rlm-dbg-02 | No | 0 | 1 | 85% | Yes | 53 |
| rlm-dbg-03 | Yes | 22 | 12 | 65% | No | 403 |
| rlm-dbg-03 | No | 22 | 10 | 65% | No | 417 |
| rlm-chg-01 | Yes | 5 | 5 | 100% | Yes | 80 |
| rlm-chg-01 | No | 10 | 7 | 85% | Yes | 90 |
| rlm-chg-02 | Yes | 6 | 6 | 85% | Yes | 47 |
| rlm-chg-02 | No | 6 | 6 | 100% | Yes | 75 |
| rlm-chg-03 | Yes | 7 | 2 | 25% | No | 267 |
| rlm-chg-03 | No | 10 | 7 | 85% | Yes | 138 |
| rlm-tgt-01 | Yes | 1 | 1 | 100% | Yes | 25 |
| rlm-tgt-01 | No | 4 | 1 | 100% | Yes | 33 |
| rlm-tgt-02 | Yes | 0 | 0 | 50% | No | 45 |
| rlm-tgt-02 | No | 2 | 1 | 100% | Yes | 58 |
| rlm-tgt-03 | Yes | 0 | 0 | 100% | Yes | 29 |
| rlm-tgt-03 | No | 8 | 5 | 100% | Yes | 58 |

### Pinnacle (external codebase — C#/.NET, not LENS's own)

| Task ID | LENS? | Tool Calls | Files Read | Score % | Pass? | Duration (s) |
|---------|-------|------------|------------|---------|-------|--------------|
| pinn-exp-01 | Yes | 16 | 12 | 100% | Yes | 185 |
| pinn-exp-01 | No | 14 | 8 | 100% | Yes | 266 |
| pinn-exp-02 | Yes | 9 | 8 | 100% | Yes | 107 |
| pinn-exp-02 | No | 6 | 6 | 20% | No | 52 |
| pinn-exp-03 | Yes | 6 | 5 | 100% | Yes | 50 |
| pinn-exp-03 | No | 8 | 7 | 100% | Yes | 94 |
| pinn-dbg-01 | Yes | 6 | 4 | 80% | Yes | 280 |
| pinn-dbg-01 | No | 7 | 5 | 60% | No | 53 |
| pinn-dbg-02 | Yes | 24 | 12 | 100% | Yes | 191 |
| pinn-dbg-02 | No | 16 | 12 | 50% | No | 175 |
| pinn-dbg-03 | Yes | 5 | 3 | 80% | Yes | 74 |
| pinn-dbg-03 | No | 4 | 5 | 80% | Yes | 84 |
| pinn-chg-01 | Yes | 14 | 10 | 100% | Yes | 81 |
| pinn-chg-01 | No | 32 | 18 | 80% | Yes | 360 |
| pinn-chg-02 | Yes | 29 | 24 | 100% | Yes | 380 |
| pinn-chg-02 | No | 20 | 15 | 100% | Yes | 98 |
| pinn-chg-03 | Yes | 23 | 18 | 100% | Yes | 167 |
| pinn-chg-03 | No | 38 | 22 | 80% | Yes | 248 |
| pinn-tgt-01 | Yes | 6 | 7 | 20% | No | 101 |
| pinn-tgt-01 | No | 8 | 6 | 20% | No | 100 |
| pinn-tgt-02 | Yes | 2 | 2 | 100% | Yes | 17 |
| pinn-tgt-02 | No | 5 | 4 | 100% | Yes | 119 |
| pinn-tgt-03 | Yes | 3 | 2 | 20% | No | 34 |
| pinn-tgt-03 | No | 4 | 2 | 20% | No | 50 |

## Summary — Combined (n=24)

| Metric | WITH LENS | WITHOUT LENS | Delta |
|--------|-----------|--------------|-------|
| Avg Score | 83.8% | 79.8% | **+4.0pp** |
| Avg Tool Calls | 8.6 | 10.8 | **-20.4%** |
| Pass Rate (>=80%) | 19/24 (79%) | 18/24 (75%) | +4pp |
| Avg Duration | 126s | 130s | -3% |

## Summary — By Repo

| Metric | RLM WITH | RLM WITHOUT | Pinn WITH | Pinn WITHOUT |
|--------|----------|-------------|-----------|--------------|
| Avg Score | 84.2% | 92.1% | 83.3% | 67.5% |
| Avg Tool Calls | 5.3 | 8.0 | 11.9 | 13.5 |
| Pass Rate | 9/12 (75%) | 11/12 (92%) | 10/12 (83%) | 7/12 (58%) |
| Avg Duration | 114s | 118s | 139s | 142s |

## By Category (combined repos)

| Category | n | WITH (avg score) | WITHOUT (avg score) | Delta | Tool Calls Saved % |
|----------|---|------------------|---------------------|-------|---------------------|
| Exploratory | 6 | **100.0%** | 84.2% | +15.8pp | 12% |
| Debug | 6 | **85.0%** | 73.3% | +11.7pp | -11% |
| Change-Impact | 6 | **85.0%** | 88.3% | -3.3pp | 28% |
| Targeted | 6 | 65.0% | **73.3%** | -8.3pp | 62% |

## Analysis

### Where LENS helps most
1. **External/unfamiliar repos** — Pinnacle WITH 83.3% vs WITHOUT 67.5% (+15.8pp). LENS context guides the agent to the right files in an unfamiliar C#/.NET codebase.
2. **Exploratory tasks** — 100% WITH vs 84.2% WITHOUT. LENS context provides the architectural overview that helps the agent understand system flow without extensive file discovery.
3. **Complex debug tasks** — pinn-dbg-01 (+20pp), pinn-dbg-02 (+50pp). LENS points to the right models/repositories in a large ORM-heavy codebase.

### Where LENS hurts or is neutral
1. **Own codebase (RLM)** — WITHOUT scored higher (92.1% vs 84.2%). The agent already knows the codebase well enough; LENS context occasionally misdirects (rlm-chg-03: 25% WITH vs 85% WITHOUT, rlm-tgt-02: 50% vs 100%).
2. **Targeted lookups** — LENS saves 62% of tool calls but scores lower. The context pack sometimes lacks the specific constant/config, causing the agent to trust LENS context rather than verifying.
3. **Change-Impact on own repo** — Both perform well; WITHOUT slightly edges out because the agent explores more thoroughly when not guided by LENS context.

### Key Failure Modes
- **rlm-chg-03 WITH (25%)**: LENS context didn't include Python-specific import files. Agent trusted context instead of searching.
- **rlm-tgt-02 WITH (50%)**: Agent relied on LENS context for constants but missed MAX_FILES_PER_COMMIT and RECENT_DAYS. Zero tool calls = no verification.
- **pinn-tgt-01/03 (20% both)**: Both conditions failed equally — these targeted questions required finding specific components that neither approach located well.
- **pinn-exp-02 WITHOUT (20%)**: Without LENS guidance, the agent found table relationships but missed the entire service/repository layer above them.

### GO/NO-GO Assessment (per `bench/go-no-go-plan.md`)

| # | Signal | GO threshold | Result | Verdict |
|---|--------|-------------|--------|---------|
| 1 | Top-3 hit rate | >80% | 95% (pre-validated via `lens eval`) | **PASS** |
| 2 | Exploratory tool-call savings | >40% (GO) / <20% (NO-GO) | **12%** ((9.3-8.2)/9.3, exploratory only) | **NO-GO** |
| 3 | Completion rate | WITH >80% AND WITH > WITHOUT | WITH 79% (19/24), WITHOUT 75% (18/24) — condition (a) fails: 79% < 80% | **FAIL** |
| 4 | Targeted overhead | Informational | WITH avg 42s vs WITHOUT avg 70s (−40%) | — |

**Signal 2 detail**: exploratory-only avg tool calls: WITH 8.2, WITHOUT 9.3. Savings = 12%. Below 20% NO-GO threshold.

**Signal 3 detail**: WITH 79.2% pass rate fails condition (a) >80%. Condition (b) WITH > WITHOUT holds (79% > 75%). Borderline fail, not in NO-GO range (NO-GO = WITH <= WITHOUT).

**Verdict: PARTIAL → re-run or fix needed**

Per decision rule (go-no-go-plan.md §8):
- GO requires Signals 1, 2, 3 all pass — **not met** (2 and 3 fail)
- NO-GO requires 2+ signals in NO-GO range — **not met** (only Signal 2 in NO-GO range; Signal 3 fails GO but is not in NO-GO range since WITH > WITHOUT)
- PARTIAL: Signal 1 passes + at most 1 of {2,3} in NO-GO range — **matches** (Signal 1 passes, only Signal 2 in NO-GO range)

**Action items before re-gate:**
1. Fix misdirection on familiar repos (rlm-chg-03, rlm-tgt-02) — context pack caused agent to skip verification
2. Improve exploratory tool-call savings — core pipeline ranks well but agent still reads many files beyond context pack
3. Re-run gate with fixes applied. Need 2 more task passes (79%→83%) and meaningful tool-call reduction on exploratory tasks

### Timing audit note

`timing.csv` contains duplicate task-condition rows from re-runs (7 tasks hit Z.AI 429 rate limit). For each duplicate, the **later row** corresponds to the successful re-run. Earlier rows with shorter durations correspond to 429 error responses (non-zero duration because the API call still took time before returning the error).
