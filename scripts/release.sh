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

# 1. Update publish.json version
sed -i '' "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW\"/" "$PUBLISH_JSON"

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
git add publish.json
git commit -m "release: v$NEW"
git tag "v$NEW"
git push && git push --tags
echo "Released v$NEW"
