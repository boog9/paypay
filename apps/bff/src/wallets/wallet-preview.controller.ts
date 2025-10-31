import { Body, Controller, HttpCode, HttpStatus, Logger, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import type { Request } from 'express';
import { WalletPreviewService } from './wallet-preview.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CsrfGuard } from '../security/csrf.guard';

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

@Controller()
export class WalletPreviewController {
  private readonly logger = new Logger(WalletPreviewController.name, { timestamp: false });

  constructor(private readonly previewService: WalletPreviewService) {}

  @Post('stores/:storeId/wallets/onchain/preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Throttle({ minute: { limit: 30, ttl: seconds(60) } })
  async previewOnchain(@Param('storeId') storeId: string, @Body() body: unknown, @Req() req: Request) {
    return this.forwardPreview('stores/:storeId/wallets/onchain/preview', storeId, body, req);
  }

  @Post('stores/:storeId/payment-methods/onchain/btc/preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Throttle({ minute: { limit: 30, ttl: seconds(60) } })
  async previewLegacy(@Param('storeId') storeId: string, @Body() body: unknown, @Req() req: Request) {
    return this.forwardPreview('stores/:storeId/payment-methods/onchain/btc/preview', storeId, body, req);
  }

  @Post('stores/:storeId/wallets/btc/preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Throttle({ minute: { limit: 30, ttl: seconds(60) } })
  async previewStable(@Param('storeId') storeId: string, @Body() body: unknown, @Req() req: Request) {
    return this.forwardPreview('stores/:storeId/wallets/btc/preview', storeId, body, req);
  }

  private forwardPreview(route: string, storeId: string, body: unknown, req: Request) {
    const requestId = extractRequestId(req);
    this.logger.log(
      {
        action: 'preview.enter',
        route,
        storeId,
        requestId
      },
      'walletPreview'
    );
    return this.previewService.previewOnchainProposedConfig(storeId, body, {
      requestId
    });
  }
}
