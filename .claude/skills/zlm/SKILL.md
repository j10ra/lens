---
name: zlm
description: Spawn a claude -p subprocess via Z.AI (glm-5) in an isolated subshell. Use for research, analysis, or any delegated task.
---

# /zlm — Spawn Claude via Z.AI

Runs `claude -p` through Z.AI (`glm-5`) in an isolated `( ... )` subshell. The main Claude uses this to delegate research, code analysis, or any work to a separate instance and get results back.

## Usage

```
/zlm <prompt or description of what to do>
/zlm [--repo <path>] [--bg] [--out <file>] <prompt>
```

Examples:
- `/zlm analyze the auth middleware in this repo`
- `/zlm --repo /path/to/project find all API endpoints and list them`
- `/zlm --bg --out results.md trace the billing pipeline end-to-end`

## Instructions

### Step 1: Parse Arguments

Extract from the user's `/zlm` invocation:
- `prompt` — the task/question to send to the subprocess (required)
- `--repo <path>` — working directory for the subprocess (default: current working directory)
- `--bg` — run in background (`run_in_background: true`); default is foreground (wait for result)
- `--out <file>` — save output to file instead of capturing inline

If no flags given, everything after `/zlm` is the prompt.

### Step 2: Build the Command

Generate a Bash command using the `cc zlm` wrapper pattern (from `rerun-pinnacle-zlm.sh`):

```bash
# Z.AI provider setup — cc() wraps everything in a subshell
_cc_setup_zlm() {
  unset ANTHROPIC_API_KEY
  export ANTHROPIC_BASE_URL="https://api.z.ai/api/anthropic"
  export ANTHROPIC_AUTH_TOKEN="83b57f32012d47168694c726ab7ce29c.yxXw25IaIoZ3L33v"
  export ANTHROPIC_DEFAULT_OPUS_MODEL="glm-5"
  export ANTHROPIC_DEFAULT_SONNET_MODEL="glm-5"
}
cc() {
  local provider="$1"; shift
  ( _cc_setup_"$provider"; CLAUDECODE= command claude "$@" )
}

cd "<repo_path>" && cc zlm -p --model sonnet --dangerously-skip-permissions \
  --disallowed-tools Task \
  -- "<prompt>"
```

If `--out <file>` is specified, redirect: `> "<file>" 2>&1`

**Critical rules:**

1. **`cc()` subshell** — `_cc_setup_zlm` + `CLAUDECODE=` + `claude` all run inside `( ... )`. Parent stays clean.
2. **`--dangerously-skip-permissions`** — Subprocess needs autonomous tool access.
3. **`--disallowed-tools Task`** — ALWAYS. Pipe mode loses output when the subprocess spawns sub-agents.
4. **`--model sonnet`** — mapped to `glm-5` via Z.AI. Cost-effective for research.

### Step 3: Execute

- **Foreground** (default): Run via Bash tool, wait for result. Show output to user or use it yourself.
- **Background** (`--bg`): Run via Bash tool with `run_in_background: true`. Report the task ID so user can check progress.
- **Long-running** (`--bg` + expected >5 min): Write a shell script with the `cc()` function, then `nohup` it to avoid Bash tool's 10-min timeout cap.

### Step 4: Use the Result

After the subprocess completes:
- If foreground: the output is directly available. Summarize or use it as needed.
- If `--out`: tell the user where the file is.
- If background: read the output file or check task status when needed.

### Notes

- The subprocess has full tool access (Read, Grep, Glob, Bash, etc.) — just not Task.
- It runs against whatever repo `--repo` points to, with all MCP tools available in that context.
- For long-running tasks, prefer `--bg` so the main session stays responsive.
- The subprocess model is `sonnet` (mapped to `glm-5` via Z.AI). This is cost-effective for research tasks.
