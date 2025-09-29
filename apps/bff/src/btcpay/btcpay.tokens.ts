export const BTCPAY_CONFIG = Symbol('BTCPAY_CONFIG');

export type BtcpayRuntimeConfig = {
  baseUrl: string;
  adminApiKey: string;
  webhookUrl: string;
  healthStoreId?: string;
  healthApiKey?: string;
};
