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

echo "➡️ Checking frontend health..."
docker compose --env-file "$ENV_FILE" exec frontend wget -qO- http://127.0.0.1:3000/health

echo "➡️ Checking external portal routing..."
curl -sI https://paypay.iddqd.in/portal | egrep 'HTTP/|content-type'

echo "➡️ Checking CORS and cookies for login..."
CSRF=$(curl -si https://paypay.iddqd.in/api/auth/csrf-token | awk -F': ' '/^x-csrf-token:/ {print $2}' | tr -d '\r')
if [[ -z "$CSRF" ]]; then
  CSRF=$(curl -s https://paypay.iddqd.in/api/auth/csrf-token | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
fi
curl -si -X POST https://paypay.iddqd.in/api/auth/login \
  -H 'Origin: https://paypay.iddqd.in' \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" \
  --data '{"email":"test@example.com","password":"***"}' | egrep -i 'set-cookie|access-control-allow-origin|http/'

popd >/dev/null
