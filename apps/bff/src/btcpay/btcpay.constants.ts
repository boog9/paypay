export const BTCPAY_MINIMAL_PERMISSIONS = [
  'btcpay.store.canmodifystoresettings',
  'btcpay.store.webhooks.canmodifywebhooks',
  'btcpay.store.canviewstoresettings',
  'btcpay.store.canviewreports',
  'btcpay.store.cancreateinvoice',
  'btcpay.store.canviewinvoices',
  'btcpay.store.canmodifyinvoices',
  'btcpay.store.canmodifypaymentrequests',
  'btcpay.store.canviewpaymentrequests',
  'btcpay.store.canviewpullpayments',
  'btcpay.store.canmanagepullpayments',
  'btcpay.store.canarchivepullpayments',
  'btcpay.store.cancreatepullpayments',
  'btcpay.store.cancreatenonapprovedpullpayments',
  'btcpay.store.canmanagepayouts',
  'btcpay.store.canviewpayouts'
];

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
