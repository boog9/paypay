import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { BtcpayService } from '../btcpay/btcpay.service';

interface PreviewConfigPayload {
  derivationScheme: string;
  accountKeyPath?: string;
  masterFingerprint?: string;
  label?: string;
}

interface PreviewRequestPayload {
  config: PreviewConfigPayload;
}

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

function normalizePreviewPayload(body: unknown): PreviewRequestPayload {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Preview payload must be an object.');
  }
  const payload = body as Record<string, unknown>;
  const configValue = payload.config;
  if (!configValue || typeof configValue !== 'object' || Array.isArray(configValue)) {
    throw new BadRequestException('config must be an object.');
  }
  const config = configValue as Record<string, unknown>;
  const rawDerivation = typeof config.derivationScheme === 'string' ? config.derivationScheme.trim() : '';
  if (!rawDerivation) {
    throw new BadRequestException('config.derivationScheme is required.');
  }

  const normalized: PreviewRequestPayload = {
    config: {
      derivationScheme: rawDerivation,
    },
  };

  if (typeof config.accountKeyPath === 'string') {
    const candidate = config.accountKeyPath.trim();
    if (candidate) {
      normalized.config.accountKeyPath = candidate;
    }
  }
  if (typeof config.masterFingerprint === 'string') {
    const candidate = config.masterFingerprint.trim();
    if (candidate) {
      normalized.config.masterFingerprint = candidate;
    }
  }
  if (typeof config.label === 'string') {
    const candidate = config.label.trim();
    if (candidate) {
      normalized.config.label = candidate;
    }
  }

  return normalized;
}

@Controller('api/stores/:storeId')
export class LegacyOnchainWalletsController {
  constructor(@Inject(BtcpayService) private readonly btcpay: BtcpayService) {}

  @Post('wallets/btc/preview')
  @HttpCode(HttpStatus.OK)
  async previewLegacy(
    @Param('storeId') storeId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const normalizedStoreId = normalizeStoreId(storeId);
    const payload = normalizePreviewPayload(body);
    return this.btcpay.proxy({
      storeId: normalizedStoreId,
      method: 'POST',
      path: `/api/v1/stores/${normalizedStoreId}/payment-methods/OnChain/BTC/preview`,
      data: payload,
      requestId: extractRequestId(req),
    });
  }

  @Post('payment-methods/onchain/btc/preview')
  @HttpCode(HttpStatus.OK)
  async previewCanonical(
    @Param('storeId') storeId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const normalizedStoreId = normalizeStoreId(storeId);
    const payload = normalizePreviewPayload(body);
    return this.btcpay.proxy({
      storeId: normalizedStoreId,
      method: 'POST',
      path: `/api/v1/stores/${normalizedStoreId}/payment-methods/OnChain/BTC/preview`,
      data: payload,
      requestId: extractRequestId(req),
    });
  }

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
      path: `/api/v1/stores/${normalizedStoreId}/payment-methods/onchain/BTC/wallet/transactions`,
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
      path: `/api/v1/stores/${normalizedStoreId}/payment-methods/onchain/BTC/wallet`,
      requestId: extractRequestId(req),
    });
  }
}
