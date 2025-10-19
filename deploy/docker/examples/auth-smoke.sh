#!/usr/bin/env bash
set -Eeuo pipefail
WORK=${WORK:-/tmp/paypay}; mkdir -p "$WORK"; rm -f "$WORK/jar.txt" "$WORK/"*.json

# 1) CSRF
curl -sS --http1.1 -H 'Accept: application/json' \
  -c "$WORK/jar.txt" -b "$WORK/jar.txt" \
  https://api.paypay.iddqd.in/api/auth/csrf -o "$WORK/csrf.json"
CSRF=$(grep -oP '(?:"csrfToken"|"token")\s*:\s*"\K[^"]+' "$WORK/csrf.json")

# 2) Логін (204, але Set-Cookie в заголовках)
jq -nc --arg email "$EMAIL" --arg password "$PASS" '{email:$email,password:$password}' > "$WORK/body.json"
curl -sS --http1.1 -i -b "$WORK/jar.txt" -c "$WORK/jar.txt" \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://paypay.iddqd.in' -H 'Referer: https://paypay.iddqd.in/' \
  -H "X-CSRF-Token: $CSRF" \
  --data-binary @"$WORK/body.json" \
  https://api.paypay.iddqd.in/api/auth/login | sed -n '1,60p'

# 3) /me
curl -sS --http1.1 -i -b "$WORK/jar.txt" https://api.paypay.iddqd.in/api/auth/me

# 4) refresh
curl -sS --http1.1 -i -b "$WORK/jar.txt" -c "$WORK/jar.txt" \
  -H 'Origin: https://paypay.iddqd.in' -H 'Referer: https://paypay.iddqd.in/' \
  -H "X-CSRF-Token: $CSRF" \
  -X POST https://api.paypay.iddqd.in/api/auth/refresh | sed -n '1,80p'
