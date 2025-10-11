export const BTCPAY_MINIMAL_PERMISSIONS = [
  'btcpay.store.cancreateinvoice',
  'btcpay.store.canviewinvoices',
  'btcpay.store.canmodifyinvoices',
  'btcpay.store.canviewstoresettings',
  'btcpay.store.webhooks.canmodifywebhooks'
];

export const BTCPAY_STORE_BOOTSTRAP_PERMISSION = 'btcpay.store.canmodifystoresettings';

export const BTCPAY_PORTAL_USER_PERMISSIONS = [
  'btcpay.store.canviewinvoices',
  'btcpay.store.cancreateinvoice',
  'btcpay.store.canmodifyinvoices',
  'btcpay.store.webhooks.canmodifywebhooks',
  'btcpay.store.canmodifystoresettings',
  'btcpay.store.canviewstoresettings',
  'btcpay.store.canviewreports',
  'btcpay.store.canviewpaymentrequests',
  'btcpay.store.canmodifypaymentrequests',
  'btcpay.user.canmodifyprofile',
  'btcpay.user.canviewprofile',
  'btcpay.user.candeleteuser',
  'btcpay.user.canmanagenotificationsforuser',
  'btcpay.user.canviewnotificationsforuser',
  'btcpay.store.canmanagepullpayments',
  'btcpay.store.canarchivepullpayments',
  'btcpay.store.cancreatepullpayments',
  'btcpay.store.canviewpullpayments',
  'btcpay.store.cancreatenonapprovedpullpayments',
  'btcpay.store.canmanagepayouts',
  'btcpay.store.canviewpayouts'
] as const;

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
