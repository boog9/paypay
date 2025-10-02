import { BadRequestException, Body, Controller, Headers, Post, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { HooksService } from './hooks.service';

@Controller('hooks')
export class HooksController {
  constructor(private readonly hooksService: HooksService) {}

  @SkipThrottle()
  @Post('btcpay')
  async handleBtcpayWebhook(
    @Req() req: Request,
    @Headers('btcpay-sig') signature: string | undefined,
    @Headers('btcpay-delivery') deliveryHeader: string | undefined,
    @Headers('btcpay-deliveryid') legacyDeliveryHeader: string | undefined,
    @Body() payload: Record<string, unknown> = {},
    @Res({ passthrough: true }) res: Response
  ) {
    const rawBody = (req as any).rawBody as Buffer | undefined;
    const deliveryId = deliveryHeader || legacyDeliveryHeader;
    if (!deliveryId) {
      throw new BadRequestException('Missing delivery identifier');
    }

    const processed = await this.hooksService.handleWebhook(
      String(deliveryId),
      signature ?? '',
      rawBody ?? Buffer.alloc(0),
      payload
    );

    if (!processed) {
      res.status(204);
      return;
    }

    res.status(202);
    return { status: 'accepted' };
  }
}
