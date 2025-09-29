export const BTCPAY_CONFIG = Symbol('BTCPAY_CONFIG');

export interface BtcpayConfig {
  baseUrl: string;
  adminApiKey: string;
  webhookUrl: string;
  healthStoreId?: string;
  healthApiKey?: string;
}
