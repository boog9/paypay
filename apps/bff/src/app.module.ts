import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BtcpayModule } from './btcpay/btcpay.module';
import { InvoicesModule } from './invoices/invoices.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), BtcpayModule, InvoicesModule, HealthModule]
})
export class AppModule {}
