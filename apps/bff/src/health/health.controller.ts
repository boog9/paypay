import { Controller, Get, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { BtcpayService } from '../btcpay/btcpay.service';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

@Controller()
export class HealthController {
  constructor(
    private readonly btcpayService: BtcpayService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

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
      if (!this.dataSource.isInitialized) {
        throw new ServiceUnavailableException('Database is not initialized');
      }
      await this.dataSource.query('SELECT 1');
      await this.btcpayService.healthProbe();
      return { status: 'ready' };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new InternalServerErrorException('Dependencies are not ready', { cause: error as Error });
    }
  }

  @Get('internal/health/btcpay')
  async btcpayHealth() {
    await this.btcpayService.healthProbe();
    return { status: 'ok' };
  }
}
