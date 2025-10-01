#!/usr/bin/env bash
set -euo pipefail
ENV_FILE="${1:-../../infra/env/.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE not found"
  exit 1
fi
REQ=(
  NEXT_PUBLIC_BFF_URL
  CADDY_ADMIN_EMAIL
  COOKIE_SECRET
  JWT_ACCESS_TOKEN_SECRET
  JWT_REFRESH_TOKEN_SECRET
  BTCPAY_SERVER_URL
  BTCPAY_ADMIN_API_KEY
  BTCPAY_WEBHOOK_URL
  BTCPAY_MASTER_KEY
)
missing=0
for k in "${REQ[@]}"; do
  if ! grep -E "^[[:space:]]*${k}=" "$ENV_FILE" >/dev/null 2>&1; then
    echo "❌ missing $k"
    missing=1
  fi
done
if [[ $missing -eq 1 ]]; then
  echo "Fill the missing keys in $ENV_FILE"; exit 1
else
  echo "✅ $ENV_FILE looks OK"
fi
