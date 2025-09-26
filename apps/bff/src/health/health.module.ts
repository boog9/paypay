import { Module } from '@nestjs/common';
import { BtcpayModule } from '../btcpay/btcpay.module';
import { HealthController } from './health.controller';

@Module({
  imports: [BtcpayModule],
  controllers: [HealthController]
})
export class HealthModule {}
