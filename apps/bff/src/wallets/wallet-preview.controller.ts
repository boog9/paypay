import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import type { Request } from 'express';
import { WalletPreviewService } from './wallet-preview.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CsrfGuard } from '../security/csrf.guard';
import { PreviewBodyDto } from './dto/preview-onchain.dto';

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

const previewValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY
});

@Controller()
export class WalletPreviewController {
  private readonly logger = new Logger(WalletPreviewController.name, { timestamp: false });

  constructor(private readonly previewService: WalletPreviewService) {}

  @Post('stores/:storeId/wallets/onchain/preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Throttle({ minute: { limit: 30, ttl: seconds(60) } })
  @UsePipes(previewValidationPipe)
  async previewOnchain(
    @Param('storeId') storeId: string,
    @Body() body: PreviewBodyDto,
    @Req() req: Request
  ) {
    const requestId = extractRequestId(req);
    this.logger.log(
      {
        action: 'preview.enter',
        route: 'stores/:storeId/wallets/onchain/preview',
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
