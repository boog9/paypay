#!/usr/bin/env sh
set -euo pipefail

APP_DIR="/workspace/apps/bff"

cd "$APP_DIR"

if [ "${NODE_ENV:-production}" != "production" ] && [ -f ".env" ]; then
  while IFS='=' read -r key value || [ -n "$key" ]; do
    case "$key" in
      ''|\#*) continue ;;
    esac
    key=${key#export }
    key=${key#export}
    key=$(printf '%s' "$key" | tr -d '[:space:]')
    if [ -z "$key" ]; then
      continue
    fi
    if [ -z "${!key+x}" ]; then
      value="${value%$'\r'}"
      while [ "${value# }" != "$value" ]; do value="${value# }"; done
      while [ "${value#$'\t'}" != "$value" ]; do value="${value#$'\t'}"; done
      export "$key=$value"
    fi
  done < .env
fi

if [ -f dist/scripts/migrate.js ]; then
  node -r reflect-metadata dist/scripts/migrate.js
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec node -r reflect-metadata dist/main.js
