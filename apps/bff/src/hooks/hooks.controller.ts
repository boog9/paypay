import { BadRequestException, Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { HooksService } from './hooks.service';

@Controller('hooks')
export class HooksController {
  constructor(private readonly hooksService: HooksService) {}

  @SkipThrottle()
  @Post('btcpay')
  async handleBtcpayWebhook(
    @Req() req: Request,
    @Headers('btcpay-sig') signature: string | undefined,
    @Headers('btcpay-delivery') deliveryHeader?: string,
    @Headers('btcpay-deliveryid') legacyDeliveryHeader?: string,
    @Body() payload: Record<string, unknown> = {}
  ) {
    const rawBody = (req as any).rawBody as Buffer | undefined;
    const deliveryId = deliveryHeader || legacyDeliveryHeader;
    if (!deliveryId) {
      throw new BadRequestException('Missing delivery identifier');
    }

    await this.hooksService.handleWebhook(String(deliveryId), signature ?? '', rawBody ?? Buffer.alloc(0), payload);

    return { status: 'accepted' };
  }
}
