#!/usr/bin/env bash
set -euo pipefail
ENV_FILE="${1:-../../infra/env/.env}"
COMPOSE_FILE="${2:-docker-compose.yml}"
mapfile -t REQ < <(grep -oE '\$\{[A-Z0-9_]+(\:\?|\?)[^}]*\}' "$COMPOSE_FILE" \
  | sed -E 's/^\$\{([A-Z0-9_]+).*/\1/' | sort -u)
missing=0
for k in "${REQ[@]}"; do
  if ! grep -E "^\s*${k}=" "$ENV_FILE" >/dev/null 2>&1; then
    echo "❌ missing required: $k"
    missing=1
  fi
done
if [[ $missing -eq 1 ]]; then
  echo "Fill missing keys in $ENV_FILE"; exit 1
else
  echo "✅ Required keys present in $ENV_FILE"
fi
