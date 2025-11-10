# BTCPay watch-only wallet import

## Supported version

Validated against BTCPay Server 2.2.1 (Greenfield API v1). Since BTCPay 2.0 the on-chain payment method identifier is `BTC-CHAIN`, and configuration payloads are nested under `config`.

## Endpoints

Use the Greenfield store payment method routes exclusively:

- `PUT /api/v1/stores/{storeId}/payment-methods/BTC-CHAIN` – apply on-chain configuration.
- `GET /api/v1/stores/{storeId}/payment-methods/BTC-CHAIN` – inspect current status.
- `GET /api/v1/stores/{storeId}/payment-methods/BTC-CHAIN/wallet/preview` – preview derived receive addresses for the configured method.
- `GET /api/v1/stores/{storeId}/payment-methods/BTC-CHAIN/wallet/address` – retrieve the active receive address.

## Minimal payload for importing a testnet tpub

Send only the required fields. Do **not** include `accountKeyPath`, `rootFingerprint`, `derivationScheme`, `source`, or `label` unless a manual override is explicitly approved.

```json
{
  "config": {
    "accountDerivation": "<TPUB>",
    "accountKeySettings": [
      { "accountKey": "<TPUB>" }
    ],
    "isHotWallet": false
  },
  "enabled": true
}
```

## Common errors and mitigations

- **422 Invalid AccountKeySettings** – resend the request with `accountKeySettings: [{ "accountKey": "<TPUB>" }]` if BTCPay signals a validation error against `AccountKeySettings`.
- **Invalid account derivation** – ensure the extended key matches the BTCPay network: `tpub`/`upub`/`vpub` for testnet and `xpub`/`ypub`/`zpub` for mainnet. Confirm the server network via `GET /api/v1/server/info` or by inspecting `supportedPaymentMethods`.
- **Missing config** – indicates a legacy route or payload format. Migrate to the `BTC-CHAIN` endpoints above and include the `config` envelope.

## Example cURL commands

```bash
# Apply minimal configuration
curl -sS -H "Authorization: token $APIKEY" -H "Content-Type: application/json" \
  -X PUT "$BTCPAY/api/v1/stores/$STORE_ID/payment-methods/BTC-CHAIN" \
  -d '{
        "config": {
          "accountDerivation": "'$TPUB'",
          "accountKeySettings": [ { "accountKey": "'$TPUB'" } ],
          "isHotWallet": false
        },
        "enabled": true
      }'

# Inspect configuration (includeConfig=true)
curl -sS -H "Authorization: token $APIKEY" \
  "$BTCPAY/api/v1/stores/$STORE_ID/payment-methods?includeConfig=true"

# Fetch current receive address
curl -sS -H "Authorization: token $APIKEY" \
  "$BTCPAY/api/v1/stores/$STORE_ID/payment-methods/BTC-CHAIN/wallet/address"
