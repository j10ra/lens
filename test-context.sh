#!/bin/bash
# RLM Context Intelligence Test Script
# Usage: ./test-context.sh [repo_id]
# If no repo_id provided, uses rlm status to detect current repo

set -e

BASE="http://127.0.0.1:4000"

# Get repo_id
if [ -n "$1" ]; then
  REPO="$1"
else
  REPO=$(curl -s "$BASE/repo/detect" -H "Content-Type: application/json" \
    -d "{\"root_path\":\"$(pwd)\"}" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  if [ -z "$REPO" ]; then
    echo "Error: Could not detect repo. Pass repo_id as argument or run from a registered repo."
    exit 1
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  RLM Context Intelligence Test"
echo "  Repo: $REPO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Define test cases: query | expected files (comma-separated substrings)
TESTS=(
  "search is slow for large repos|search.ts,grep.ts,vector.ts"
  "add a new CLI command|commands/,index.ts"
  "how does the embedding pipeline work|embed,embedder,worker"
  "fix bug in file watcher debounce|watcher.ts"
  "understand the context pack format|formatter.ts,task.ts"
  "git history analysis and co-changes|git-analysis.ts,structural.ts"
  "how are imports resolved across files|imports.ts,import-graph.ts"
  "repo registration and indexing flow|engine.ts,register"
)

PASS=0
FAIL=0
TOTAL=${#TESTS[@]}

for entry in "${TESTS[@]}"; do
  IFS='|' read -r query expected <<< "$entry"
  IFS=',' read -ra expected_files <<< "$expected"

  result=$(curl -s -X POST "$BASE/context" -H 'Content-Type: application/json' \
    -d "{\"repo_id\":\"$REPO\",\"goal\":\"$query\"}")

  pack=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['context_pack'])" 2>/dev/null)
  ms=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['stats']['duration_ms'])" 2>/dev/null)
  files=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['stats']['files_in_context'])" 2>/dev/null)

  # Check expected files
  hits=0
  misses=""
  for ef in "${expected_files[@]}"; do
    if echo "$pack" | grep -qi "$ef"; then
      hits=$((hits + 1))
    else
      misses="$misses $ef"
    fi
  done

  total_expected=${#expected_files[@]}
  pct=$((hits * 100 / total_expected))

  if [ "$pct" -ge 50 ]; then
    icon="\033[32m✓\033[0m"
    PASS=$((PASS + 1))
  else
    icon="\033[31m✗\033[0m"
    FAIL=$((FAIL + 1))
  fi

  echo ""
  echo -e "$icon  $query"
  echo "   ${ms}ms | ${files} files | ${hits}/${total_expected} expected"
  if [ -n "$misses" ]; then
    echo -e "   \033[33mmissing:$misses\033[0m"
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Results: $PASS/$TOTAL passed ($((PASS * 100 / TOTAL))%)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
