#!/usr/bin/env bash
# Dev script — watches source, rebuilds publish bundle, restarts daemon.
# Single command: `pnpm dev`

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=4111

kill_daemon() {
  local pid
  pid=$(lsof -t -i:"$PORT" -sTCP:LISTEN 2>/dev/null) || true
  if [ -n "$pid" ]; then
    kill -9 "$pid" 2>/dev/null
    for i in 1 2 3 4 5; do
      lsof -t -i:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 || break
      sleep 0.3
    done
  fi
}

rebuild() {
  echo ""
  echo "==> Rebuilding publish bundle..."
  kill_daemon
  pnpm -w build:publish
  echo "==> Starting daemon..."
  node "$ROOT/publish/daemon.js" &
  sleep 1
  if lsof -t -i:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "==> Daemon running on :$PORT"
  else
    echo "==> WARNING: Daemon failed to start"
  fi
}

cleanup() {
  kill_daemon
  exit 0
}
trap cleanup SIGINT SIGTERM

# Initial build + start
rebuild

# Watch source dirs for changes, rebuild on detect
echo "==> Watching for changes..."
fswatch -o \
  "$ROOT/packages/core/src" \
  "$ROOT/packages/engine/src" \
  "$ROOT/packages/cli/src" \
  "$ROOT/apps/daemon/src" \
  "$ROOT/apps/dashboard/src" \
  | while read -r _count; do
    # Debounce — drain rapid-fire events
    sleep 0.5
    while read -r -t 0.5 _; do :; done
    rebuild
  done
