import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BtcpayService } from './btcpay.service';
import { BTCPAY_CONFIG, type BtcpayConfig } from './btcpay.tokens';

@Module({
  providers: [
    BtcpayService,
    {
      provide: BTCPAY_CONFIG,
      useFactory: (config: ConfigService): BtcpayConfig => ({
        baseUrl: config.getOrThrow<string>('BTCPAY_URL'),
        adminApiKey: config.getOrThrow<string>('BTCPAY_ADMIN_API_KEY'),
        webhookUrl: config.getOrThrow<string>('BTCPAY_WEBHOOK_URL'),
        healthStoreId: config.get<string>('BTCPAY_HEALTH_STORE_ID') ?? undefined,
        healthApiKey: config.get<string>('BTCPAY_HEALTH_API_KEY') ?? undefined
      }),
      inject: [ConfigService]
    }
  ],
  exports: [BtcpayService]
})
export class BtcpayModule {}
