#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLISH_JSON="$ROOT/publish.json"
CLI_INDEX="$ROOT/packages/cli/src/index.ts"

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

# 1. Update publish.json
sed -i '' "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW\"/" "$PUBLISH_JSON"

# 2. Update CLI source
sed -i '' "s/.version(\"$CURRENT\")/.version(\"$NEW\")/" "$CLI_INDEX"

# 3. Build everything
echo "Building..."
pnpm -w build:publish

# 4. Update publish/package.json (copied from publish.json during build)
# Already correct since build:publish copies publish.json → publish/package.json

# 5. Verify
BUILT_VER=$(node -p "require('$ROOT/publish/package.json').version")
CLI_VER=$(grep -o 'version("[^"]*")' "$ROOT/publish/cli.js" | head -1)
echo "publish/package.json: $BUILT_VER"
echo "publish/cli.js: $CLI_VER"

if [ "$BUILT_VER" != "$NEW" ]; then
  echo "ERROR: publish/package.json version mismatch!"
  exit 1
fi

# 6. Publish
echo ""
read -p "Publish lens-engine@$NEW to npm? [y/N] " CONFIRM
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
  cd "$ROOT/publish" && npm publish
  echo "Published lens-engine@$NEW"

  # 7. Commit + tag
  cd "$ROOT"
  git add publish.json packages/cli/src/index.ts
  git commit -m "release: v$NEW"
  git tag "v$NEW"
  echo "Committed + tagged v$NEW (run 'git push && git push --tags' to push)"
else
  echo "Skipped publish. Files are updated — run 'cd publish && npm publish' manually."
fi
