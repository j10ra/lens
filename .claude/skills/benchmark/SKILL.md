---
name: benchmark
description: Generate test scenarios for a repo, run A/B tests (WITH/WITHOUT LENS), score results. Full benchmark pipeline.
---

# /benchmark — Full A/B Benchmark Pipeline

Analyzes a repo, generates test scenarios across 4 categories, runs each WITH and WITHOUT LENS via Z.AI, scores results, and produces a report.

## Usage

```
/benchmark [repo_path]                          Full run (generate + run + score)
/benchmark -n 12 [repo_path]                    Full run with 12 scenarios
/benchmark --eval "<prompt>" [repo_path]         Single A/B test with a given prompt
/benchmark --scenarios-only [repo_path]         Generate scenarios without running
/benchmark --run <run_id>                        Run tests for existing scenario file
/benchmark --score <run_id>                      Score completed runs
```

Options:
- `-n <count>` — number of scenarios to generate (default: 8, range: 4-16)

Examples:
- `/benchmark` — benchmark current repo (8 scenarios)
- `/benchmark -n 12 /path/to/project` — 12 scenarios for gate-level sample size
- `/benchmark --eval "how does auth work?" /path/to/project` — single A/B test
- `/benchmark --scenarios-only /path/to/project` — just generate scenarios
- `/benchmark --score 2026-02-15-1430` — score an existing run

## Instructions

### Overview

Two modes:

**Full pipeline** (default): generate scenarios → run A/B → score → report
1. **Generate** — analyze the repo, create test scenarios
2. **Run** — execute each scenario WITH and WITHOUT LENS via Z.AI
3. **Score** — judge outputs against criteria, produce results

**Single eval** (`--eval`): run one prompt A/B → report side-by-side
- Skip scenario generation — use the provided prompt directly
- Create a single task ID: `eval-<timestamp>`
- Run WITHOUT then WITH, report comparison table
- No judge criteria or scoring — just raw comparison

### Step 1: Setup Run Directory

Create a run folder with datetime ID:

```
bench/<run_id>/
  protocol.md       ← snapshot of protocol used for this run
  scenarios.md      ← generated test scenarios
  runs/             ← output files
    <task_id>-with.md
    <task_id>-without.md
    timing.csv
  results.md        ← scored results + cross-reference analysis
```

Generate `run_id` as `YYYY-MM-DD-HHmm` (e.g. `2026-02-15-1430`).

```bash
mkdir -p bench/<run_id>/runs
cp .claude/skills/benchmark/protocol.md bench/<run_id>/protocol.md
```

### Step 2: Generate Scenarios

Analyze the target repo to generate test scenarios across 4 categories. Use the `-n` count from the user's invocation (default: 8).

**Use the `/zlm` pattern** to spawn a claude subprocess that analyzes the repo:

```bash
# Use the cc zlm wrapper (same pattern as rerun-pinnacle-zlm.sh)
_cc_setup_zlm() {
  unset ANTHROPIC_API_KEY
  export ANTHROPIC_BASE_URL="https://api.z.ai/api/anthropic"
  export ANTHROPIC_AUTH_TOKEN="83b57f32012d47168694c726ab7ce29c.yxXw25IaIoZ3L33v"
  export ANTHROPIC_DEFAULT_OPUS_MODEL="glm-5"
  export ANTHROPIC_DEFAULT_SONNET_MODEL="glm-5"
}
cc() { local p="$1"; shift; ( _cc_setup_$p; CLAUDECODE= command claude "$@" ); }

cd "<repo_path>" && cc zlm --dsp -p --model sonnet \
  --disallowed-tools Task \
  -- "<scenario generation prompt>"
```

**Scenario generation prompt** (send this to the subprocess):

Analyze this codebase and generate <N> test scenarios for benchmarking an AI coding assistant. Output ONLY valid markdown in the exact format below — no preamble, no commentary.

Categories (distribute evenly):

1. **Exploratory** — understand architecture, trace workflows, map systems (best for `lens_graph`)
2. **Debug** — diagnose a plausible bug, trace error paths, find root causes
3. **Change-Impact** — map files affected by a hypothetical change (new field, new enum, new feature) (best for `lens_graph`)
4. **Targeted** — find a specific class, constant, config, or function (best for `lens_grep`)

**LENS tool fit by category:**

| Category | `lens_grep` | `lens_graph` | `lens_graph_neighbors` | Why |
|----------|-------------|--------------|------------------------|-----|
| Exploratory | Medium | **High** | **High** | Architecture = dependency graph + file neighborhoods |
| Debug | **High** | Medium | **High** | Find symbols, trace imports/importers |
| Change-Impact | Medium | **High** | **High** | Who imports this file? Co-change partners? |
| Targeted | **High** | Low | Medium | Find specific symbol/export |

For each scenario, generate:
- A realistic prompt an engineer would ask
- 3-5 judge criteria (verifiable facts the answer MUST mention)

Use this exact format for each:
```
#### <prefix>-<cat>-<nn>
- **Category**: <category>
- **Prompt**:
  `<the prompt text>`
- **Judge Criteria**:
  1. <fact 1>
  2. <fact 2>
  3. <fact 3>

Rules:
- Prefix: use the repo folder name, lowercased, max 4 chars (e.g. "pinn", "lens", "myap")
- Category abbreviations: exp, dbg, chg, tgt
- Number sequentially within each category: exp-01, exp-02, dbg-01, etc.
- Judge criteria must be objectively verifiable from the codebase (file paths, class names, config values)
- Prompts should NOT mention LENS or any tooling — they are questions about the codebase itself
- Do NOT wrap the entire output in a code fence
```

Save the subprocess output to `bench/<run_id>/scenarios.md`.

After saving, read the file back and verify it has valid task entries (lines matching `#### <id>`). Extract the task IDs for the run phase.

### Step 3: Run Tests

For each scenario in `scenarios.md`, run two conditions: **WITHOUT** and **WITH**.

Extract each task's prompt from the `scenarios.md` file (the content inside the code block under **Prompt**).

**CRITICAL**: `claude -p` (pipe mode) buffers ALL output until completion — file stays 0 bytes until done. Runs can take 2-15+ minutes. The Bash tool has a hard 10-minute max timeout. ALWAYS use the `run.sh` script via `nohup` — NEVER run `claude -p` directly in Bash tool.

#### The Run Script

Use `.claude/skills/benchmark/run.sh` — a reusable script that handles Z.AI setup, retries, timing, and randomized sequential WITH/WITHOUT execution.

```
Usage: run.sh <task_id> <repo_path> <runs_dir> <prompt> [both|with|without]
```

#### Launching

For each task, launch detached via `nohup`:

```bash
SCRIPT="/Volumes/Drive/__x/RLM/.claude/skills/benchmark/run.sh"
RUNS="/Volumes/Drive/__x/RLM/bench/<run_id>/runs"

nohup bash "$SCRIPT" "<task_id>" "<repo_path>" "$RUNS" "<prompt>" both \
  > /tmp/bench-<task_id>.log 2>&1 &
echo "Launched PID $! — monitor via: tail -f /tmp/bench-<task_id>.log"
```

For multiple tasks, launch separate `nohup` calls simultaneously.

#### Monitoring

Poll output files or check the log:

```bash
# Check if runs are done
for f in /Volumes/Drive/__x/RLM/bench/<run_id>/runs/<task_id>-{with,without}.md; do
  [ -s "$f" ] && echo "DONE: $f ($(wc -l < "$f") lines)" || echo "PENDING: $f"
done

# Or check the log
tail /tmp/bench-<task_id>.log
```

#### Execution Rules
- **`nohup` + `&`** — script runs detached from Bash tool. No timeout limit.
- **Parallel conditions** — within each task, WITH and WITHOUT run in parallel (backgrounded + wait). Eliminates order bias, halves wall-clock time.
- **Multiple tasks** — launch separate `nohup` calls per task, all simultaneously.
- **Skip existing** — non-empty output files are not re-run.
- **3 retries** — if process exits with empty output, retry automatically.

### Step 4: Score Results

After all runs complete, score each output against its judge criteria from `scenarios.md`.

#### 4a. Judge Criteria Scoring

Read each output file (`<task_id>-with.md`, `<task_id>-without.md`) and evaluate:

| Verdict | Points |
|---------|--------|
| Met (explicitly stated) | 1.0 |
| Partial (vague/incomplete) | 0.5 |
| Missed (absent or wrong) | 0.0 |

Score = (points / total criteria) x 100%, rounded to nearest 5%.

#### 4b. Extract Self-Report

Extract from the agent's `## Report` section at the end of each output:
- **Tool calls** — total tool calls made
- **Tools used** — list of tool names (e.g. Read, Grep, Glob, Bash, mcp__lens__lens_grep)
- **Files read** — number of files read
- **Files used** — comma-separated list of file paths

**LENS adoption** detected during scoring:
- `lens_grep` adopted: `mcp__lens__lens_grep` in "Tools used"
- `lens_graph` adopted: `mcp__lens__lens_graph` in "Tools used"
- `lens_graph_neighbors` adopted: `mcp__lens__lens_graph_neighbors` in "Tools used"
- Any LENS: any of the above tools used

Not prompted explicitly — avoids priming the agent.

Pipe mode (`claude -p`) outputs only final response text — tool invocations are not visible, so self-report is the only source.
Read timing from `timing.csv`.

#### 4c. Cross-Reference Analysis

For each task, compare WITH vs WITHOUT outputs:

| Metric | How |
|--------|-----|
| lens_grep adopted | `mcp__lens__lens_grep` in self-report (yes/no) |
| lens_graph adopted | `mcp__lens__lens_graph` in self-report (yes/no) |
| lens_graph_neighbors adopted | `mcp__lens__lens_graph_neighbors` in self-report (yes/no) |
| Any LENS | Any LENS tool used (yes/no) |
| Score delta | `score(WITH) - score(WITHOUT)` |
| File divergence | WITH cited files vs WITHOUT cited files |
| Misdirection | WITH cited different files AND `score(WITH) < score(WITHOUT)` |

### Step 5: Write Results

Write `bench/<run_id>/results.md` in this format:

```markdown
# Benchmark Results — <run_id>

**Repo**: <repo_path>
**Model**: glm-5 (via Z.AI)
**Date**: <date>
**Scenarios**: <count>

## Raw Results

| Task ID | Condition | Tool Calls | LENS Used? | Files Read | Score % | Pass? | Duration (s) |
|---------|-----------|------------|------------|------------|---------|-------|--------------|
| <task_id> | WITH | <n> | Yes/No | <n> | <n>% | Yes/No | <n> |
| <task_id> | WITHOUT | <n> | — | <n> | <n>% | Yes/No | <n> |
...

## Summary

| Metric | WITH LENS | WITHOUT LENS | Delta |
|--------|-----------|-------------|-------|
| Avg Tool Calls | <n> | <n> | <diff> |
| LENS Adoption Rate | <n>/<total> | — | — |
| Avg Score | <n>% | <n>% | <diff>pp |
| Pass Rate | <n>/<total> | <n>/<total> | <diff>pp |
| Avg Duration | <n>s | <n>s | <diff>% |

## By Category

| Category | n | WITH (avg score) | WITHOUT (avg score) | Score Delta | LENS Adopted? |
|----------|---|------------------|---------------------|-------------|---------------|
| Exploratory | <n> | <n>% | <n>% | <diff>pp | <n>/<n> |
| Debug | <n> | <n>% | <n>% | <diff>pp | <n>/<n> |
| Change-Impact | <n> | <n>% | <n>% | <diff>pp | <n>/<n> |
| Targeted | <n> | <n>% | <n>% | <diff>pp | <n>/<n> |

## Cross-Reference Analysis

| Task ID | lens_grep | lens_graph | Score WITH | Score WITHOUT | Delta | Misdirected? |
|---------|-----------|------------|------------|---------------|-------|-------------|
| <task_id> | Yes/No | Yes/No | <n>% | <n>% | <diff>pp | Yes/No |
...

### Aggregate

| Metric | Value |
|--------|-------|
| lens_grep Adoption Rate | <n>/<total> (<n>%) |
| lens_graph Adoption Rate | <n>/<total> (<n>%) |
| Any LENS Adoption Rate | <n>/<total> (<n>%) |
| Score Delta (LENS adopted) | <diff>pp |
| Score Delta (LENS not adopted) | <diff>pp |
| Misdirection Rate | <n>/<adopted> |
```

### Single Eval Mode (`--eval`)

When `--eval "<prompt>"` is used, skip scenario generation:

1. Create run dir: `bench/<run_id>/runs/` (same datetime ID)
2. Task ID: `eval-<unix_timestamp>` (e.g. `eval-1739612400`)
3. Run WITHOUT then WITH using the same commands from Step 3
4. After both complete, present a side-by-side comparison:

```markdown
## A/B Result: <task_id>

| Metric      | WITHOUT LENS | WITH LENS |
|-------------|-------------|-----------|
| Tool calls  | <n>         | <n>       |
| Files read  | <n>         | <n>       |
| Duration    | <n>s        | <n>s      |

### WITHOUT LENS — Key Findings
<bullet list from output>

### WITH LENS — Key Findings
<bullet list from output>
```

No scoring or judge criteria — just raw comparison for quick iteration.

### Critical Rules

1. **`( ... )` subshell** — all Z.AI env vars isolated. No leakage.
2. **`--disallowed-tools`** — WITHOUT disallows `Task` + all 4 LENS MCP tools (`lens_grep`, `lens_graph`, `lens_graph_neighbors`, `lens_reindex`). WITH disallows only `Task` (LENS MCP tools available via `--mcp-config lens-mcp.json`).
3. **`nohup` detached scripts** — `claude -p` pipe mode can take 2-15+ min. Bash tool has 10-min hard cap. ALWAYS use `run.sh` via `nohup`. NEVER run `claude -p` directly in Bash tool.
4. **Parallel conditions** — within each task, both conditions run in parallel. Multiple tasks get separate `nohup` calls, all launched simultaneously. See `protocol.md` (sibling file).
5. **Identical prompts** — both conditions receive the exact same prompt. The ONLY variable is whether LENS MCP tools are available. No pre-injection, no context packs in prompts.
6. **Skip existing** — non-empty output files are not re-run.
7. **All paths absolute** — output always under `/Volumes/Drive/__x/RLM/bench/<run_id>/`.
8. **Protocol snapshot** — always copy `protocol.md` into the run directory at setup (Step 1).
