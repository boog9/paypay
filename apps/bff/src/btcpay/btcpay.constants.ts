export const BTCPAY_MINIMAL_PERMISSIONS = [
  'btcpay.store.cancreateinvoice',
  'btcpay.store.canviewinvoices',
  'btcpay.store.canmodifyinvoices',
  'btcpay.store.canmodifystoresettings',
  'btcpay.store.canviewstoresettings',
  'btcpay.store.webhooks.canmodifywebhooks'
];

export const BTCPAY_STORE_BOOTSTRAP_PERMISSION = 'btcpay.store.canmodifystoresettings';

export const BTCPAY_PORTAL_USER_PERMISSIONS = [BTCPAY_STORE_BOOTSTRAP_PERMISSION] as const;

export const BTCPAY_INVOICE_WEBHOOK_EVENTS = [
  // TODO: Validate event names against the deployed BTCPay Server version to avoid
  // 422 responses during webhook registration. Consider making this configurable via env.
  'InvoiceCreated',
  'InvoiceProcessing',
  'InvoicePaid',
  'InvoiceExpired',
  'InvoiceInvalid',
  'InvoiceSettled'
] as const;

export const BTC_ONCHAIN_PMID = 'BTC-CHAIN';
