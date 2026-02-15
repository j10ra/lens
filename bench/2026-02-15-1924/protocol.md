# Benchmark Protocol

Standard protocol for A/B testing LENS MCP tools vs cold agent. Used by `/benchmark` skill.

---

## 1. Execution Method

All runs use `cc zlm` — isolated Z.AI subshell via `claude -p` pipe mode.

```
cc zlm -p --model sonnet --dangerously-skip-permissions
```

- **Script**: `.claude/skills/benchmark/run.sh` handles retries, timing, condition logic
- **Detached**: Always launch via `nohup` — `claude -p` buffers output, Bash tool has 10-min hard cap
- **Retries**: Up to 3 attempts per run if output is empty

### Condition Definitions

| Condition | LENS MCP Tools | Prompt | MCP Config |
|-----------|---------------|--------|------------|
| **WITHOUT** | All 4 disallowed | Raw task prompt only | None |
| **WITH** | All 4 available | Raw task prompt only (identical) | `lens-mcp.json` |

**WITHOUT must have zero LENS artifacts.** No MCP tools, no injected context. The `--disallowed-tools` flag blocks all 4 LENS MCP tools (`get_context`, `list_repos`, `get_status`, `index_repo`). The prompt contains only the task text + report suffix.

**WITH has LENS MCP tools available on-demand.** The agent receives the same raw prompt as WITHOUT. LENS tools are made available via `--mcp-config lens-mcp.json`. The agent decides when/if to call LENS — no pre-injected context, no forced usage. This tests the product-realistic mode where agents pull context when needed.

Both conditions also disallow the `Task` tool (prevents sub-agent spawning which loses pipe output). Both receive identical prompts.

---

## 2. Run Order

### Randomized Sequential (not parallel)

Within each task, the two conditions run **sequentially in randomized order**. This avoids:
- Resource contention (CPU, disk, network)
- Caching bias (filesystem cache, daemon cache)
- Order bias (randomized, not alternating)

The `run.sh` script randomizes which condition runs first per task using `$((RANDOM % 2))`.

Multiple tasks MAY run in parallel (separate `nohup` processes) since they operate on independent prompts.

---

## 3. Metric Capture

### Tool Calls & Files Read: Self-Report

`claude -p` pipe mode outputs only the agent's final response text — tool invocations are not visible in the output. Machine-derived parsing (grep for `Read(`, `Glob(`, etc.) returns zero matches.

The prompt suffix asks the agent to self-report:
1. Total tool calls made
2. Files read (count)
3. Key findings (bullet list)

Self-report is the **primary and only** source for tool call and file read counts.

### Duration

Wall-clock seconds from `timing.csv` (recorded by `run.sh`). This is machine-derived and reliable.

---

## 4. Scoring

### Judge Criteria

Each task has 2-5 `judge_criteria` — verifiable facts the answer must mention.

| Verdict | Points | Definition |
|---------|--------|------------|
| **Met** | 1.0 | Explicitly stated in the output |
| **Partial** | 0.5 | Alluded to but vague or incomplete |
| **Missed** | 0.0 | Not mentioned or wrong |

**Score** = points / total criteria x 100%, rounded to nearest 5%.

### Task Completion

A task is **complete** if score >= 80%.

### Quasi-Blinded Judging

1. Finish both runs for a task
2. Score both outputs against criteria side-by-side
3. Apply criteria mechanically — a criterion is either stated or not

---

## 5. Environment Controls

| Setting | WITH | WITHOUT |
|---------|------|---------|
| Agent | `claude -p` via Z.AI | `claude -p` via Z.AI |
| Model | glm-5 (sonnet mapping) | glm-5 (sonnet mapping) |
| Working dir | Target repo root | Target repo root |
| LENS MCP | **Available** (via `--mcp-config`) | Disallowed |
| Prompt | Raw task + report suffix | Raw task + report suffix |
| Task tool | Disallowed | Disallowed |
| Session | Fresh (pipe mode = no history) | Fresh |
| Subshell | `( ... )` isolated env vars | `( ... )` isolated env vars |

### Model Scope

Results are valid **only for the model used**. A glm-5 gate does not prove LENS works for Opus or Codex. If the gate decision needs to justify rollout for a different model/agent, re-run on that target model.

---

## 6. Output Structure

```
bench/<run_id>/
  scenarios.md        ← generated or referenced task definitions
  runs/
    <task_id>-with.md
    <task_id>-without.md
    timing.csv        ← mixed rows: model_mapping header + task_id,condition,duration_s,attempt
  results.md          ← scored results + summary tables
```

---

## 7. Discard Rules

Discard a run if:
- Output is empty after 3 retries
- Agent crashes mid-run
- Model version changes between conditions
- LENS MCP server failed to start during WITH condition (check for MCP connection errors in output)

Re-run discarded tasks. If >4 runs discarded, investigate root cause.
