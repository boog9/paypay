export const BTCPAY_CLIENT = Symbol('BTCPAY_CLIENT');
export const BTCPAY_CONFIG = Symbol('BTCPAY_CONFIG');

export interface BtcpayConfig {
  baseUrl: string;
  apiKey: string;
}
