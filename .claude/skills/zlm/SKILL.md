---
name: zlm
description: Spawn a claude -p subprocess via Z.AI (glm-5) in an isolated subshell. Use for research, analysis, or any delegated task.
---

# /zlm — Spawn Claude via Z.AI

Runs `claude -p` through Z.AI (`glm-5`) using the Task tool with a Bash agent. Offloads research to a cheaper model while keeping your context clean.

## Usage

```
/zlm <prompt or description of what to do>
/zlm [--repo <path>] [--out <file>] <prompt>
```

## Instructions

### Step 1: Parse Arguments

- `prompt` — task/question for the subprocess (required)
- `--repo <path>` — working directory (default: current working directory)
- `--out <file>` — output path (default: `/tmp/zlm-<timestamp>-out.md`)

### Step 2: Launch via Task Tool

Use the **Task tool** with `subagent_type: "Bash"` and `run_in_background: true`.

The runner script is `.claude/skills/zlm/run.sh` — it handles key loading, Z.AI env setup, output validation, and the `ZLM_DONE`/`ZLM_FAIL` sentinel.

```
Task(
  subagent_type: "Bash",
  run_in_background: true,
  prompt: "Run this command and wait for it to complete:
    bash /Volumes/Drive/__x/RLM/.claude/skills/zlm/run.sh '<repo_path>' '<outfile>' '<prompt>'
    Then read <outfile> and return the contents."
)
```

For **multiple parallel runs**, launch multiple Task calls in a single message — each with a different outfile.

### Step 3: Get Results

Use `TaskOutput` to check on the background agent, or wait for notification. The agent reads the output file and returns the contents directly — no manual file reading needed.

### Step 4: Use the Result

The Task result contains the glm-5 subprocess output. Summarize or act on it.

## Critical Rules

1. **ALWAYS use Task tool** — not raw Bash. Task handles lifecycle, background, and result retrieval.
2. **ALWAYS use `run.sh`** — never inline the cc/zlm setup. The script handles key loading, env isolation, output validation.
3. **`run_in_background: true`** — `claude -p` through Z.AI takes 1-5 min. Never block the main session.
4. **Parallel runs OK** — each Task gets its own outfile. Launch multiple in one message.
5. **`ZLM_DONE`/`ZLM_FAIL`** — written by `run.sh`. The Bash agent uses this to confirm completion before reading output.
