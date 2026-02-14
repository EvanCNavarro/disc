#!/bin/bash

# Version Bump Script for DISC
# Usage: ./scripts/version-bump.sh [major|minor|patch]
# If no argument provided, shows current version and prompts for bump type

set -e

VERSION_FILE="packages/shared/src/version.ts"
ROOT_PKG="package.json"

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
  echo "      Bug fixes, infrastructure, refactors, dependency updates"
  echo ""
  echo "  [2] MINOR -> v$MAJOR.$((MINOR + 1)).0"
  echo "      New features, significant UX changes, new pages"
  echo ""
  echo "  [3] MAJOR -> v$((MAJOR + 1)).0.0"
  echo "      Breaking changes, major architecture changes"
  echo ""
  echo "Decision: Will regular USERS notice something new?"
  echo "  No  -> PATCH"
  echo "  Yes -> MINOR"
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

echo "Updated $VERSION_FILE"
echo "Updated $ROOT_PKG"
echo ""
echo "New version: v$NEW_VERSION"
echo ""
echo "Don't forget to commit this change before pushing!"
