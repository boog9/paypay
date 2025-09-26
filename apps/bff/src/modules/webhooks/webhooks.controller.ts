import { Body, Controller, Headers, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import { WebhooksService } from "./webhooks.service";

@ApiTags("webhooks")
@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post("btcpay")
  async handleBtcpayWebhook(
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(body);
    this.webhooksService.validateSignature(rawBody, headers["btcpay-sig"] ?? headers["btcpay-signature"]);
    await this.webhooksService.enqueueEvent(body, headers);
    return res.status(202).json({ received: true });
  }
}
