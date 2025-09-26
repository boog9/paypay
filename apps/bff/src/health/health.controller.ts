import { Controller, Get, InternalServerErrorException } from '@nestjs/common';
import { BtcpayService } from '../btcpay/btcpay.service';

@Controller()
export class HealthController {
  constructor(private readonly btcpayService: BtcpayService) {}

  @Get('healthz')
  healthz() {
    return { status: 'ok' };
  }

  @Get('readyz')
  async readyz() {
    try {
      await this.btcpayService.listStores();
      return { status: 'ready' };
    } catch (error) {
      throw new InternalServerErrorException('BTCPay is not reachable', { cause: error as Error });
    }
  }
}
