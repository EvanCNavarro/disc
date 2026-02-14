#!/bin/bash

# Version Check Script for DISC
# Compares local version against remote to ensure version was bumped before push
# Returns 0 if version is newer, 1 if not

set -e

VERSION_FILE="packages/shared/src/version.ts"
REMOTE_BRANCH="origin/main"

# Get local version
LOCAL_VERSION=$(grep "APP_VERSION" "$VERSION_FILE" | sed "s/.*\"\(.*\)\".*/\1/")

if [ -z "$LOCAL_VERSION" ]; then
  echo "Could not read local version from $VERSION_FILE"
  exit 1
fi

# Get remote version (if remote exists)
git fetch origin main --quiet 2>/dev/null || true

REMOTE_VERSION=""
if git show "$REMOTE_BRANCH:$VERSION_FILE" &>/dev/null; then
  REMOTE_VERSION=$(git show "$REMOTE_BRANCH:$VERSION_FILE" 2>/dev/null | grep "APP_VERSION" | sed "s/.*\"\(.*\)\".*/\1/")
fi

# If no remote version, this is first push - allow it
if [ -z "$REMOTE_VERSION" ]; then
  echo "First push with version v$LOCAL_VERSION"
  exit 0
fi

echo "Local version:  v$LOCAL_VERSION"
echo "Remote version: v$REMOTE_VERSION"

# Compare versions
compare_versions() {
  local v1=$1
  local v2=$2

  IFS='.' read -r v1_major v1_minor v1_patch <<< "$v1"
  IFS='.' read -r v2_major v2_minor v2_patch <<< "$v2"

  if [ "$v1_major" -gt "$v2_major" ]; then
    return 0
  elif [ "$v1_major" -lt "$v2_major" ]; then
    return 1
  fi

  if [ "$v1_minor" -gt "$v2_minor" ]; then
    return 0
  elif [ "$v1_minor" -lt "$v2_minor" ]; then
    return 1
  fi

  if [ "$v1_patch" -gt "$v2_patch" ]; then
    return 0
  elif [ "$v1_patch" -lt "$v2_patch" ]; then
    return 1
  fi

  return 1  # Same version - not allowed
}

if compare_versions "$LOCAL_VERSION" "$REMOTE_VERSION"; then
  echo "Version bump detected: v$REMOTE_VERSION -> v$LOCAL_VERSION"
  exit 0
else
  echo ""
  echo "Version not bumped! Current remote is already at v$REMOTE_VERSION"
  echo ""
  echo "Before pushing, you must bump the version:"
  echo "  ./scripts/version-bump.sh patch   # Bug fixes, minor tweaks"
  echo "  ./scripts/version-bump.sh minor   # New features, UI changes"
  echo "  ./scripts/version-bump.sh major   # Breaking changes"
  echo ""
  echo "Then commit and push again."
  exit 1
fi
