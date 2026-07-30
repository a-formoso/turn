#!/bin/bash
# Post-merge setup for Cinema Machine.
# Dev is buildless (raw app/*.jsx via Babel standalone), so there is nothing to
# rebuild here; dist/ is produced at deploy time by the deployment build command.
# We only install node deps (used by serve.js / build tooling) when present.
set -e

if [ -f package.json ]; then
  npm install --no-audit --no-fund
fi

echo "post-merge setup OK"
