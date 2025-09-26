import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createBTCPayClient } from '@paypay/sdk';
import { BtcpayService } from './btcpay.service';
import { BTCPAY_CLIENT, BTCPAY_CONFIG, type BtcpayConfig } from './btcpay.tokens';

@Module({
  providers: [
    BtcpayService,
    {
      provide: BTCPAY_CONFIG,
      useFactory: (config: ConfigService): BtcpayConfig => ({
        baseUrl: config.getOrThrow<string>('BTCPAY_URL'),
        apiKey: config.getOrThrow<string>('BTCPAY_API_KEY')
      }),
      inject: [ConfigService]
    },
    {
      provide: BTCPAY_CLIENT,
      useFactory: (cfg: BtcpayConfig) =>
        createBTCPayClient({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey }),
      inject: [BTCPAY_CONFIG]
    }
  ],
  exports: [BtcpayService]
})
export class BtcpayModule {}
