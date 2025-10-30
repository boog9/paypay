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

  @Post('stores/:storeId/wallets/btc/preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Throttle({ minute: { limit: 30, ttl: seconds(60) } })
  async previewWallet(@Param('storeId') storeId: string, @Body() body: unknown, @Req() req: Request) {
    this.logger.log(
      {
        action: 'preview.enter',
        route: 'stores/:storeId/wallets/btc/preview',
        storeId,
        requestId: extractRequestId(req)
      },
      'walletPreview'
    );
    return this.previewService.previewOnchainProposedConfig(storeId, body, {
      requestId: extractRequestId(req)
    });
  }

  @Post('stores/:storeId/payment-methods/onchain/btc/preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Throttle({ minute: { limit: 30, ttl: seconds(60) } })
  async previewLegacy(@Param('storeId') storeId: string, @Body() body: unknown, @Req() req: Request) {
    this.logger.log(
      {
        action: 'preview.enter',
        route: 'stores/:storeId/payment-methods/onchain/btc/preview',
        storeId,
        requestId: extractRequestId(req)
      },
      'walletPreview'
    );
    return this.previewService.previewOnchainProposedConfig(storeId, body, {
      requestId: extractRequestId(req)
    });
  }
}
