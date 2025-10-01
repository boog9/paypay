#!/usr/bin/env bash
set -euo pipefail

gen(){ openssl rand -base64 32; }

echo "COOKIE_SECRET=$(gen)"
echo "JWT_ACCESS_TOKEN_SECRET=$(gen)"
echo "JWT_REFRESH_TOKEN_SECRET=$(gen)"
echo "BTCPAY_MASTER_KEY=$(gen)"
