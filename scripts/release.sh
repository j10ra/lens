#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLISH_JSON="$ROOT/publish.json"

# Read current version
CURRENT=$(node -p "require('$PUBLISH_JSON').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

# Determine bump type
BUMP="${1:-patch}"
case "$BUMP" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
  *) echo "Usage: ./scripts/release.sh [major|minor|patch]"; exit 1 ;;
esac

NEW="$MAJOR.$MINOR.$PATCH"
echo "Bumping $CURRENT → $NEW ($BUMP)"

# 1. Update all version sources in lockstep.
#    publish.json is the only one consumed by npm publish, but workspace
#    package.json files and the CLI's runtime version literal MUST stay in
#    sync — otherwise `lens --version` reports a stale number.
VERSION_FILES=(
  "$PUBLISH_JSON"
  "$ROOT/package.json"
  "$ROOT/packages/cli/package.json"
  "$ROOT/packages/core/package.json"
  "$ROOT/packages/engine/package.json"
  "$ROOT/apps/daemon/package.json"
  "$ROOT/apps/dashboard/package.json"
  "$ROOT/apps/web/package.json"
)
for f in "${VERSION_FILES[@]}"; do
  sed -i '' "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW\"/" "$f"
done
# CLI runtime version literal lives in source code, not package.json.
sed -i '' "s/const VERSION = \"$CURRENT\";/const VERSION = \"$NEW\";/" "$ROOT/packages/cli/src/index.ts"

# 2. Build everything
echo "Building..."
pnpm -w build:publish

# 3. Verify
BUILT_VER=$(node -p "require('$ROOT/publish/package.json').version")
echo "publish/package.json: $BUILT_VER"

if [ "$BUILT_VER" != "$NEW" ]; then
  echo "ERROR: publish/package.json version mismatch!"
  exit 1
fi

# 4. Publish
cd "$ROOT/publish" && npm publish
echo "Published lens-engine@$NEW"

# 5. Commit + tag + push
cd "$ROOT"
git add "${VERSION_FILES[@]}" packages/cli/src/index.ts
git commit -m "release: v$NEW"
git tag "v$NEW"
git push && git push --tags
echo "Released v$NEW"
