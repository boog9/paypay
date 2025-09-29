#!/usr/bin/env sh
set -euo pipefail

if [ -f dist/scripts/migrate.js ]; then
  node dist/scripts/migrate.js
fi

exec node dist/main.js
