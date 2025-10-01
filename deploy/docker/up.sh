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

echo "✅ Stack is launching. Run 'docker compose ps' to inspect service status."

popd >/dev/null
