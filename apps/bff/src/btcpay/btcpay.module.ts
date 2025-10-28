import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BtcpayService } from './btcpay.service';
import { BtcpayProvisioningService } from './btcpay-provisioning.service';
import { BTCPAY_CONFIG, type BtcpayRuntimeConfig } from './btcpay.tokens';
import { StoreEntity } from '../tenants/entities/store.entity';
import { SecurityModule } from '../security/security.module';
import { BtcpayPaymentMethodsService } from './btcpay.payment-methods.service';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { BtcpayKeysService } from './btcpay.keys.service';
import { BtcpayServerInfoService } from './btcpay.server-info.service';

@Module({
  imports: [TypeOrmModule.forFeature([StoreEntity, ManagedStoreEntity]), SecurityModule],
  providers: [
    BtcpayService,
    BtcpayProvisioningService,
    BtcpayPaymentMethodsService,
    BtcpayKeysService,
    BtcpayServerInfoService,
    {
      provide: BTCPAY_CONFIG,
      useFactory: (config: ConfigService): BtcpayRuntimeConfig => {
        const baseUrl = config.get<string>('BTCPAY_SERVER_URL');
        if (!baseUrl) {
          throw new Error('BTCPAY_SERVER_URL is not configured');
        }
        const isHttps = baseUrl.startsWith('https://');
        const isDev = (config.get<string>('NODE_ENV') ?? 'development') !== 'production';
        if (!isHttps && !isDev) {
          throw new Error('BTCPAY_SERVER_URL must use https:// in production');
        }

        const adminApiKey = config.get<string>('BTCPAY_ADMIN_API_KEY');
        if (!adminApiKey) {
          throw new Error('BTCPAY_ADMIN_API_KEY is not configured');
        }

        const webhookUrl = config.get<string>('BTCPAY_WEBHOOK_URL');
        if (!webhookUrl) {
          throw new Error('BTCPAY_WEBHOOK_URL is not configured');
        }

        const healthStoreId = config.get<string>('BTCPAY_HEALTH_STORE_ID') ?? undefined;
        const healthApiKey = config.get<string>('BTCPAY_HEALTH_API_KEY') ?? undefined;
        if ((healthStoreId && !healthApiKey) || (!healthStoreId && healthApiKey)) {
          throw new Error('BTCPAY health probe requires both store ID and API key');
        }

        return {
          baseUrl,
          adminApiKey,
          webhookUrl,
          healthStoreId,
          healthApiKey
        } satisfies BtcpayRuntimeConfig;
      },
      inject: [ConfigService]
    }
  ],
  exports: [
    BtcpayService,
    BtcpayProvisioningService,
    BtcpayPaymentMethodsService,
    BtcpayKeysService,
    BtcpayServerInfoService
  ]
})
export class BtcpayModule {}
