#!/bin/bash
set -euo pipefail

# Usage: run.sh <task_id> <repo_path> <runs_dir> <prompt> [both|with|without]
#
# Examples:
#   ./run.sh eval-123 /path/to/repo bench/2026-02-15/runs "What is TOKEN_CAP?" both
#   ./run.sh pinn-exp-01 /path/to/repo bench/2026-02-15/runs "How does auth work?" without
#
# Requires: GLOBAL_GLM_KEY env var (set in ~/.zshrc)

TASK_ID="$1"
REPO="$2"
RUNS="$3"
PROMPT="$4"
CONDITION="${5:-both}"

# --- Load env vars (nohup runs non-interactive, .zshrc not sourced) ---
# Can't `source ~/.zshrc` from bash (zsh-specific syntax). Extract the key directly.
if [ -z "${GLOBAL_GLM_KEY:-}" ] && [ -f "$HOME/.zshrc" ]; then
  GLOBAL_GLM_KEY=$(grep -m1 'GLOBAL_GLM_KEY=' "$HOME/.zshrc" | sed 's/.*="\(.*\)"/\1/')
  export GLOBAL_GLM_KEY
fi

if [ -z "${GLOBAL_GLM_KEY:-}" ]; then
  echo "ERROR: GLOBAL_GLM_KEY not set. Add to ~/.zshrc or export it."
  exit 1
fi

# --- Z.AI provider setup (mirrors ~/.zshrc _cc_setup_zlm) ---
_cc_setup_zlm() {
  unset ANTHROPIC_API_KEY
  export ANTHROPIC_BASE_URL="https://api.z.ai/api/anthropic"
  export ANTHROPIC_AUTH_TOKEN="$GLOBAL_GLM_KEY"
  export ANTHROPIC_DEFAULT_OPUS_MODEL="glm-5"
  export ANTHROPIC_DEFAULT_SONNET_MODEL="glm-5"
}

cc() {
  local provider="$1"; shift
  ( _cc_setup_"$provider"; CLAUDECODE= command claude "$@" )
}

TF="$RUNS/timing.csv"

# [P2 fix] Log resolved model mapping for audit trail
echo "model_mapping,sonnet=glm-5,opus=glm-5" >> "$TF"

# WITHOUT: disallow Task + all LENS MCP tools (agent works cold)
DISALLOW_WITHOUT="Task,mcp__lens__lens_grep,mcp__lens__lens_graph,mcp__lens__lens_reindex"

# WITH: only disallow Task (LENS MCP tools available for on-demand use)
DISALLOW_WITH="Task"

# MCP config that makes LENS tools available (even in foreign repos without .mcp.json)
LENS_MCP="/Volumes/Drive/__x/RLM/.claude/skills/benchmark/lens-mcp.json"

SUFFIX=$'IMPORTANT: Do NOT use the Task tool or delegate to sub-agents. Do all file reading and analysis directly.\n\nWhen done, end your response with this EXACT format:\n\n## Report\n\n- **Tool calls**: <total number of tool calls made>\n- **Tools used**: <list ALL tool names used, e.g. Read, Grep, Glob, Bash, mcp__*>\n- **Files read**: <number of files read>\n- **Files used**: <comma-separated list of file paths that informed your answer>\n- **Key findings**:\n  - <finding 1>\n  - <finding 2>\n  - <finding 3>'

run_task() {
  local task_id="$1" condition="$2" full_prompt="$3"
  local outfile="$RUNS/${task_id}-${condition}.md"
  [ -s "$outfile" ] && echo "SKIP $task_id $condition (exists)" && return 0

  # Condition-specific config
  local disallow mcp_flags
  if [ "$condition" = "with" ]; then
    disallow="$DISALLOW_WITH"
    mcp_flags="--mcp-config $LENS_MCP"
  else
    disallow="$DISALLOW_WITHOUT"
    mcp_flags=""
  fi

  for attempt in 1 2 3; do
    local st=$(date +%s)
    (cd "$REPO" && cc zlm -p --model sonnet --dangerously-skip-permissions \
      --disallowed-tools "$disallow" \
      $mcp_flags \
      -- "$full_prompt") > "$outfile" 2>&1 || true
    local et=$(date +%s)
    if [ -s "$outfile" ]; then
      echo "$task_id,$condition,$((et - st)),attempt=$attempt" >> "$TF"
      echo "DONE $task_id $condition in $((et - st))s (attempt $attempt)"
      return 0
    fi
    echo "RETRY $task_id $condition (attempt $attempt empty)"
    rm -f "$outfile"
  done
  echo "FAIL $task_id $condition (3 attempts)"
}

# --- Run conditions ---

run_without() {
  echo "Starting WITHOUT..."
  run_task "$TASK_ID" "without" "${PROMPT}

${SUFFIX}"
}

run_with() {
  echo "Starting WITH (MCP mode — lens_grep + lens_graph available)..."
  run_task "$TASK_ID" "with" "${PROMPT}

${SUFFIX}"
}

case "$CONDITION" in
  both)
    # Parallel — both conditions run simultaneously, no order bias
    echo "Starting BOTH in parallel..."
    run_without &
    PID_WITHOUT=$!
    run_with &
    PID_WITH=$!
    wait $PID_WITHOUT
    wait $PID_WITH
    ;;
  without)
    run_without
    ;;
  with)
    run_with
    ;;
  *)
    echo "Unknown condition: $CONDITION (use: both, with, without)"
    exit 1
    ;;
esac

echo "COMPLETE $TASK_ID"
