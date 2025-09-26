# PayPay Privacy & PII Minimization Policy

PayPay is designed to minimize the collection, retention, and processing of personally identifiable information (PII). Our focus is on merchant authentication and orchestration of BTCPay Server resources.

## Data Collected
- **Email address** – Required for user authentication, notifications, and account recovery.
- **Organization metadata** – Friendly names and identifiers of organizations and stores managed through PayPay.
- **Webhook metadata** – Event types, store identifiers, invoice IDs. We never store payer names, emails, or wallet addresses.

## Data Not Collected
- Wallet private keys or seed phrases.
- Customer payment details, including payer emails, on-chain addresses, Lightning node public keys, or fiat equivalents.
- BTCPay API keys (we only store references and rotate via the Authorize flow).

## Controls
- Argon2id password hashing and JWT rotation enforce account security.
- Secrets (JWT, BTCPay signing key, database credentials) are injected via environment variables and never hard-coded.
- Access logs omit payment details and obfuscate email addresses when possible.
- Signed webhooks are validated before persistence; duplicate deliveries are ignored via idempotency keys.
- Role-based access: only users with `merchant` role can operate stores they belong to.

## Retention
- Email addresses and authentication data are retained while the account is active.
- Webhook logs are retained for 30 days for auditability, after which they are purged automatically (policy enforced via scheduled jobs, to be implemented).
- Archived stores keep only metadata necessary to reconcile historical payments.

## Incident Response
- In the event of a suspected breach, credentials and API keys can be rotated by revoking tokens in BTCPay and PayPay simultaneously.
- Logs are centralized with redaction to avoid accidental leakage of PII.
