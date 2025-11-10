import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { BtcpayService } from '../btcpay/btcpay.service';

function normalizeStoreId(value: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new BadRequestException('Store identifier is required');
  }
  return trimmed;
}

function extractRequestId(req: Request): string | undefined {
  const header = req.headers['x-request-id'] ?? req.headers['x-requestid'];
  if (Array.isArray(header)) {
    const candidate = header[0]?.trim();
    return candidate ? candidate : undefined;
  }
  if (typeof header === 'string') {
    const candidate = header.trim();
    return candidate ? candidate : undefined;
  }
  return undefined;
}

@Controller('api/stores/:storeId')
export class LegacyOnchainWalletsController {
  constructor(@Inject(BtcpayService) private readonly btcpay: BtcpayService) {}

  @Get('wallets/btc/transactions')
  async listTransactions(
    @Param('storeId') storeId: string,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
  ) {
    const normalizedStoreId = normalizeStoreId(storeId);
    return this.btcpay.proxy({
      storeId: normalizedStoreId,
      method: 'GET',
      path: `/api/v1/stores/${normalizedStoreId}/payment-methods/BTC-CHAIN/wallet/transactions`,
      params: query,
      requestId: extractRequestId(req),
    });
  }

  @Get('wallets/btc/overview')
  async getOverview(
    @Param('storeId') storeId: string,
    @Req() req: Request,
  ) {
    const normalizedStoreId = normalizeStoreId(storeId);
    return this.btcpay.proxy({
      storeId: normalizedStoreId,
      method: 'GET',
      path: `/api/v1/stores/${normalizedStoreId}/payment-methods/BTC-CHAIN/wallet`,
      requestId: extractRequestId(req),
    });
  }
}
