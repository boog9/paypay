#!/usr/bin/env sh
set -euo pipefail

if [ -f dist/scripts/migrate.js ]; then
  node -r reflect-metadata dist/scripts/migrate.js
fi

exec node -r reflect-metadata dist/main.js
