#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/infra/env/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ Expected env file at $ENV_FILE" >&2
  exit 1
fi

pushd "$SCRIPT_DIR" >/dev/null

./check-required-env.sh "$ENV_FILE"

echo "🚀 Starting Docker Compose stack (env: $ENV_FILE)"
docker compose --env-file "$ENV_FILE" up -d --build

echo "🔍 Verifying frontend health endpoint..."
FRONTEND_HEALTH=$(docker compose exec frontend sh -c "wget -qO- http://127.0.0.1:3000/health" || true)
if [[ "$FRONTEND_HEALTH" != *'"ok":true'* ]]; then
  echo "❌ Frontend healthcheck failed. Expected JSON with \"ok\":true but got:" >&2
  echo "$FRONTEND_HEALTH" >&2
  exit 1
fi

echo "✅ Stack is launching and frontend healthcheck passed. Run 'docker compose ps' to inspect service status."

popd >/dev/null
