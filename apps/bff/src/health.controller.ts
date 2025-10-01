import { Controller, Get, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BtcpayService } from './btcpay/btcpay.service';

@Controller()
export class HealthController {
  constructor(
    private readonly btcpayService: BtcpayService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get('/health')
  health() {
    return { status: 'ok' } as const;
  }

  @Get('/readyz')
  async readyz() {
    try {
      if (!this.dataSource.isInitialized) {
        throw new ServiceUnavailableException('Database is not initialized');
      }

      await this.dataSource.query('SELECT 1');
      await this.btcpayService.healthProbe();

      return { status: 'ready' } as const;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new InternalServerErrorException('Dependencies are not ready', {
        cause: error as Error,
      });
    }
  }

  @Get('/internal/health/btcpay')
  async btcpayHealth() {
    await this.btcpayService.healthProbe();
    return { status: 'ok' } as const;
  }
}
