import { Module } from '@nestjs/common';
import { BtcpayModule } from '../btcpay/btcpay.module';
import { InvoicesController } from './invoices.controller';

@Module({
  imports: [BtcpayModule],
  controllers: [InvoicesController]
})
export class InvoicesModule {}
