#!/usr/bin/env bash
# Post-edit hook: biome format + lint + tsc for the affected package
set -euo pipefail

ROOT="/Volumes/Drive/__x/RLM"
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  exit 0
fi

# Only check ts/tsx/js/jsx files
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx) ;;
  *) exit 0 ;;
esac

ERRORS=""

# 1. Biome format + lint (auto-fix)
if BIOME_OUT=$(cd "$ROOT" && npx @biomejs/biome check --write --unsafe "$FILE" 2>&1); then
  : # clean
else
  # Filter out success noise, keep actual errors
  FILTERED=$(echo "$BIOME_OUT" | grep -E "^(×|✖|error|  [0-9])" || true)
  if [ -n "$FILTERED" ]; then
    ERRORS="$ERRORS
[biome] $FILE
$FILTERED"
  fi
fi

# 2. Find the package root for tsc
PKG_DIR=""
DIR=$(dirname "$FILE")
while [ "$DIR" != "/" ] && [ "$DIR" != "$ROOT" ]; do
  if [ -f "$DIR/tsconfig.json" ]; then
    PKG_DIR="$DIR"
    break
  fi
  DIR=$(dirname "$DIR")
done

# 3. Run tsc if we found a tsconfig
if [ -n "$PKG_DIR" ]; then
  if ! TSC_OUT=$(cd "$PKG_DIR" && npx tsc --noEmit 2>&1); then
    ERRORS="$ERRORS
[tsc] $PKG_DIR
$TSC_OUT"
  fi
fi

# Report
if [ -n "$ERRORS" ]; then
  echo "{\"decision\":\"block\",\"reason\":\"Type/lint errors after edit:$ERRORS\"}"
  exit 0
fi

exit 0
