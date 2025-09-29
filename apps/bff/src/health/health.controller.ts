import { Controller, Get, InternalServerErrorException } from '@nestjs/common';
import { BtcpayService } from '../btcpay/btcpay.service';

@Controller()
export class HealthController {
  constructor(private readonly btcpayService: BtcpayService) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('healthz')
  healthz() {
    return { status: 'ok' };
  }

  @Get('readyz')
  async readyz() {
    try {
      await this.btcpayService.healthProbe();
      return { status: 'ready' };
    } catch (error) {
      throw new InternalServerErrorException('BTCPay is not reachable', { cause: error as Error });
    }
  }

  @Get('internal/health/btcpay')
  async btcpayHealth() {
    await this.btcpayService.healthProbe();
    return { status: 'ok' };
  }
}
