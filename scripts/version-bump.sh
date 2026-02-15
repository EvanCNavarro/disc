#!/bin/bash

# Version Bump Script for DISC
# Usage: ./scripts/version-bump.sh [major|minor|patch]
# If no argument provided, shows current version and prompts for bump type
#
# Updates: version.ts, package.json, changelog.json (scaffolds empty entry)

set -e

VERSION_FILE="packages/shared/src/version.ts"
ROOT_PKG="package.json"
CHANGELOG_JSON="packages/shared/src/changelog.json"

# Extract current version from version.ts
CURRENT_VERSION=$(grep "APP_VERSION" "$VERSION_FILE" | sed "s/.*\"\(.*\)\".*/\1/")

if [ -z "$CURRENT_VERSION" ]; then
  echo "Could not read current version from $VERSION_FILE"
  exit 1
fi

# Parse version components
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

echo "Current version: v$CURRENT_VERSION"
echo ""

# Determine bump type
BUMP_TYPE=$1

if [ -z "$BUMP_TYPE" ]; then
  echo "Which version to bump?"
  echo ""
  echo "  [1] PATCH -> v$MAJOR.$MINOR.$((PATCH + 1))"
  echo "      Bug fixes, typos, config tweaks, dep updates, refactors"
  echo "      (Users won't notice anything new)"
  echo ""
  echo "  [2] MINOR -> v$MAJOR.$((MINOR + 1)).0"
  echo "      New features, new pages, visible UX changes"
  echo "      (Users will see something new)"
  echo ""
  echo "  [3] MAJOR -> v$((MAJOR + 1)).0.0"
  echo "      Breaking changes, data migrations, architecture overhaul"
  echo "      (Existing behavior changes or breaks)"
  echo ""
  echo "Decision tree:"
  echo "  Does existing behavior break? -> MAJOR"
  echo "  Will users notice something?  -> MINOR"
  echo "  Everything else               -> PATCH"
  echo ""
  read -p "Enter choice (1/2/3): " choice

  case $choice in
    1) BUMP_TYPE="patch" ;;
    2) BUMP_TYPE="minor" ;;
    3) BUMP_TYPE="major" ;;
    *) echo "Invalid choice"; exit 1 ;;
  esac
fi

# Calculate new version
case $BUMP_TYPE in
  major)
    NEW_VERSION="$((MAJOR + 1)).0.0"
    ;;
  minor)
    NEW_VERSION="$MAJOR.$((MINOR + 1)).0"
    ;;
  patch)
    NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"
    ;;
  *)
    echo "Invalid bump type: $BUMP_TYPE"
    echo "Usage: $0 [major|minor|patch]"
    exit 1
    ;;
esac

echo ""
echo "Bumping version: v$CURRENT_VERSION -> v$NEW_VERSION"

# Update version.ts (uses double quotes, not single)
sed -i '' "s/APP_VERSION = \"$CURRENT_VERSION\"/APP_VERSION = \"$NEW_VERSION\"/" "$VERSION_FILE"

# Update root package.json
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$ROOT_PKG"

# Scaffold changelog.json entry for the new version
TODAY=$(date +%Y-%m-%d)
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$CHANGELOG_JSON', 'utf8'));
// Only add if this version doesn't already exist
if (!data.versions.some(v => v.version === '$NEW_VERSION')) {
  data.versions.unshift({
    version: '$NEW_VERSION',
    date: '$TODAY',
    entries: []
  });
  fs.writeFileSync('$CHANGELOG_JSON', JSON.stringify(data, null, 2) + '\n');
  console.log('  Scaffolded $CHANGELOG_JSON with empty v$NEW_VERSION entry');
} else {
  console.log('  $CHANGELOG_JSON already has v$NEW_VERSION');
}
"

echo "Updated $VERSION_FILE"
echo "Updated $ROOT_PKG"
echo ""
echo "New version: v$NEW_VERSION"
echo ""
echo "Next steps:"
echo "  1. Add entries to $CHANGELOG_JSON"
echo "  2. Update CHANGELOG.md"
echo "  3. Commit and push"
