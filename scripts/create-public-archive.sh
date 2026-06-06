#!/bin/bash
# Build a clean LawLink source archive for review before GitHub publication.
# The archive includes tracked files and untracked non-ignored source files.
# Ignored local data such as .env, storage, backups, outputs, build caches, and node_modules are excluded.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

mkdir -p dist

STAMP="$(date +%Y%m%d_%H%M%S)"
ARCHIVE="dist/lawlink-public-source-${STAMP}.tar.gz"

git ls-files --cached --others --exclude-standard -z \
  | tar --null -czf "$ARCHIVE" --files-from -

echo "Created $ARCHIVE"
