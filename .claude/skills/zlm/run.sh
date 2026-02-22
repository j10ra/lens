#!/bin/bash
set -euo pipefail

# Usage: run.sh <repo_path> <outfile> <prompt>
#
# Examples:
#   ./run.sh /path/to/repo /tmp/zlm-out.md "Analyze the auth middleware"
#   nohup bash ./run.sh /path/to/repo /tmp/zlm-out.md "List all API endpoints" &
#
# Requires: GLOBAL_GLM_KEY env var (set in ~/.zshrc)

REPO="$1"
OUTFILE="$2"
PROMPT="$3"

# --- Load env vars (nohup runs non-interactive, .zshrc not sourced) ---
if [ -z "${GLOBAL_GLM_KEY:-}" ] && [ -f "$HOME/.zshrc" ]; then
  GLOBAL_GLM_KEY=$(grep -m1 'GLOBAL_GLM_KEY=' "$HOME/.zshrc" | sed 's/.*="\(.*\)"/\1/')
  export GLOBAL_GLM_KEY
fi

if [ -z "${GLOBAL_GLM_KEY:-}" ]; then
  echo "ERROR: GLOBAL_GLM_KEY not set. Add to ~/.zshrc or export it." > "$OUTFILE"
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

MIN_BYTES=200

(cd "$REPO" && cc zlm -p --model sonnet --dangerously-skip-permissions \
  --disallowed-tools Task \
  -- "$PROMPT") > "$OUTFILE" 2>&1 || true

BYTES=$(wc -c < "$OUTFILE" 2>/dev/null || echo 0)
if [ "$BYTES" -ge "$MIN_BYTES" ]; then
  echo "" >> "$OUTFILE"
  echo "ZLM_DONE bytes=$BYTES" >> "$OUTFILE"
else
  echo "ZLM_FAIL bytes=$BYTES (min=$MIN_BYTES)" >> "$OUTFILE"
fi
