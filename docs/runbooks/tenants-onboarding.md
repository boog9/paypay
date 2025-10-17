# Tenants onboarding runbook

This runbook documents the checks required to keep the tenant onboarding flow healthy after the `gen_random_uuid()` default fix and BTCPay integration hardening.

## Prerequisites

- Access to the production/staging BTCPay Server with the admin API key managed through KMS/HSM.
- Access to the PayPay BFF deployment (logs, environment variables, database migrations).
- `curl`, `jq`, and a writable temp directory for cookie jars during smoke tests.

## Database migration

1. Deploy the migration `1729600000000-FixUuidDefaults.ts`.
2. Run the migration runner (e.g. `pnpm db:migrate` or the Compose helper).
3. Validate that every `public.*` table with a UUID `id` column now shows `gen_random_uuid()` as the default:

   ```sql
   SELECT table_name, column_default
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND column_name = 'id'
     AND data_type = 'uuid'
   ORDER BY table_name;
   ```

   You should only see `gen_random_uuid()` (or an equivalent expression) and no `NULL` defaults.

## Smoke test (BTCPay onboarding)

Replace the placeholders with valid credentials before running the sequence.

```bash
API="https://api.paypay.iddqd.in"
ORIGIN="https://paypay.iddqd.in"
JAR=/tmp/paypay.cookies
EMAIL="user@example.com"
PASS="change-me"

rm -f "$JAR"
curl -s -c "$JAR" -H "Origin: $ORIGIN" "$API/api/auth/csrf" >/dev/null
CSRF=$(curl -s -b "$JAR" "$API/api/auth/csrf" | jq -r .csrfToken)
curl -s -i -c "$JAR" -b "$JAR" -H "Origin: $ORIGIN" -H "X-CSRF-Token: $CSRF" -H "Content-Type: application/json" \
  -X POST "$API/api/auth/login" --data "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" >/dev/null
CSRF=$(curl -s -b "$JAR" "$API/api/auth/csrf" | jq -r .csrfToken)

TENANT_EMAIL="tenant+$(date +%s)@iddqd.in"
TENANT_NAME="default"
STORE_NAME="debug-store-ua"

curl -s -i -b "$JAR" -H "Origin: $ORIGIN" -H "X-CSRF-Token: $CSRF" -H "Content-Type: application/json" \
  -X POST "$API/api/tenants" \
  --data "{\"name\":\"$TENANT_NAME\",\"email\":\"$TENANT_EMAIL\",\"storeName\":\"$STORE_NAME\"}" \
  | sed -n '/^{/,$p' | jq .
```

Expected output (values will differ):

```json
{
  "tenantId": "4a7bf662-262f-467e-b7d9-3eaead4e9491",
  "storeId": "e6c3779c-72c6-4b8d-80c1-ef1f728e7bf4",
  "btcpayStoreId": "BxnVXC3NkXpUKsPfDYjbvrZUs3JkDKaoxRoUFDoBnSBp"
}
```

Repeat the `POST /api/tenants` call with the same `TENANT_EMAIL` to verify that the BFF now returns `409 Conflict` with the message `BTCPay user already exists` instead of a 5xx.

## Log review

- Confirm there are no `QueryFailedError: null value in column "id"` entries after the migration.
- When revoking non-existent BTCPay API keys the BFF should emit `WARN` logs with the redacted suffix (e.g. `****abcd`) instead of an error.
- If an `Idempotency-Key` header was present, the log entry should include `correlationId`.

## Troubleshooting tips

- If the migration fails because `pgcrypto` is missing, check the database user permissions and ensure the extension can be created.
- A persistent `401` from BTCPay usually means the managed API key is stale—rotate it via the tenant settings workflow and retry.
- For repeated 409 responses, confirm whether the BTCPay user already exists via the admin UI and decide whether to reuse or clean up the account.
