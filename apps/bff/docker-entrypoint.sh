#!/bin/sh
set -e

CANDIDATES="
dist/main.js
dist/src/main.js
apps/bff/dist/main.js
dist/apps/bff/main.js
main.js
"

cd /opt/app 2>/dev/null || true

for p in $CANDIDATES; do
  if [ -f "$p" ]; then
    MIGRATION_SCRIPT=""
    for m in \
      /opt/app/dist/src/scripts/migrate.js \
      /opt/app/dist/scripts/migrate.js \
      /opt/app/apps/bff/dist/src/scripts/migrate.js \
      /opt/app/apps/bff/dist/scripts/migrate.js; do
      if [ -f "$m" ]; then
        MIGRATION_SCRIPT="$m"
        break
      fi
    done

    if [ -n "$MIGRATION_SCRIPT" ]; then
      echo "[entrypoint] Running DB migrations..."
      node "$MIGRATION_SCRIPT" || {
        echo "[entrypoint] Migration failed";
        exit 1;
      }
    fi

    echo "[entrypoint] Starting: node $p"
    exec node "$p"
  fi
done

echo "[entrypoint] ERROR: could not locate main.js in any of: $CANDIDATES" >&2
ls -lah .
find . -maxdepth 4 -name main.js -print || true
exit 1
