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
| **WITHOUT** | All 3 disallowed | Raw task prompt only | None |
| **WITH** | All 3 available | Raw task prompt only (identical) | `lens-mcp.json` |

**LENS MCP Tools (v2):**
- `mcp__lens__lens_grep` — Structural code search with TF-IDF ranking, symbol extraction, hub scores
- `mcp__lens__lens_graph` — Dependency graph (clusters or file-level), import edges, co-change pairs
- `mcp__lens__lens_graph_neighbors` — File neighborhood: symbols, exports, imports, importers, co-change partners
- `mcp__lens__lens_reindex` — Trigger repo reindex (rarely needed in benchmarks)

**WITHOUT must have zero LENS artifacts.** No MCP tools, no injected context. The `--disallowed-tools` flag blocks all 4 LENS MCP tools (`lens_grep`, `lens_graph`, `lens_graph_neighbors`, `lens_reindex`). The prompt contains only the task text + report suffix.

**WITH has LENS MCP tools available on-demand.** The agent receives the same raw prompt as WITHOUT. LENS tools are made available via `--mcp-config lens-mcp.json`. The agent decides when/if to call LENS — no pre-injected context, no forced usage. This tests the product-realistic mode where agents pull context when needed.

Both conditions also disallow the `Task` tool (prevents sub-agent spawning which loses pipe output). Both receive identical prompts.

---

## 2. Run Order

### Parallel

Within each task, both conditions run **in parallel** (backgrounded `&` + `wait`). This:
- Eliminates order bias entirely
- Halves wall-clock time per task
- No contention — separate `claude -p` processes, separate API calls, read-only repo access

Multiple tasks also run in parallel (separate `nohup` processes).

---

## 3. Metric Capture

### Self-Report Fields

`claude -p` pipe mode outputs only the agent's final response text — tool invocations are not visible in the output. The prompt suffix asks the agent to self-report in a `## Report` section:

1. **Tool calls** — total tool calls made
2. **Tools used** — list of tool names (e.g. Read, Grep, Glob, Bash)
3. **Files read** — count of files read
4. **Files used** — comma-separated file paths that informed the answer
5. **Key findings** — bullet list

Self-report is the **primary and only** source for these counts.

**LENS adoption** is detected during scoring by checking tool usage:
- `lens_grep` adopted: `mcp__lens__lens_grep` in "Tools used"
- `lens_graph` adopted: `mcp__lens__lens_graph` in "Tools used"
- `lens_graph_neighbors` adopted: `mcp__lens__lens_graph_neighbors` in "Tools used"
- Any LENS: any of the above tools used

The prompt suffix instructs the agent to check ToolSearch for available MCP tools before starting — this is fair because both conditions receive the same instruction. The WITHOUT condition has LENS tools disallowed, so ToolSearch won't return them. The WITH condition will discover and load them. This addresses deferred tool loading without naming LENS specifically.

### Duration

Wall-clock seconds from `timing.csv` (recorded by `run.sh`). Machine-derived and reliable.

### Cross-Reference Analysis (Scoring Phase)

After scoring, compute per-task causal metrics by comparing outputs:

| Metric | How | Meaning |
|--------|-----|---------|
| **lens_grep adopted** | `mcp__lens__lens_grep` in self-report | Agent used structural search |
| **lens_graph adopted** | `mcp__lens__lens_graph` in self-report | Agent used dependency graph |
| **lens_graph_neighbors adopted** | `mcp__lens__lens_graph_neighbors` in self-report | Agent used file neighborhood |
| **Any LENS** | Any LENS tool used | Agent chose LENS |
| **Score delta** | score(WITH) - score(WITHOUT) | Net outcome |
| **File divergence** | WITH cited ≠ WITHOUT cited | Agent took a different path |
| **Misdirection** | WITH cited different files AND score(WITH) < score(WITHOUT) | LENS steered agent wrong |

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
