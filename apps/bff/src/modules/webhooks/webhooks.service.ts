import { Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { InjectQueue } from "@nestjs/bullmq";
import { Repository } from "typeorm";
import { Queue } from "bullmq";
import { createHmac, timingSafeEqual } from "crypto";
import { WebhookEventLog } from "./entities/webhook-event-log.entity";

@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(WebhookEventLog) private readonly eventsRepo: Repository<WebhookEventLog>,
    @InjectQueue("webhooks") private readonly queue: Queue
  ) {}

  validateSignature(rawBody: string, signature: string | undefined) {
    if (!signature) throw new UnauthorizedException("Missing signature header");
    const secret = process.env.BTCPAY_WEBHOOK_SECRET ?? "";
    const raw = signature ?? "";
    const provided = raw.startsWith("sha256=") ? raw.slice("sha256=".length) : raw;
    const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
    let signatureBuffer: Buffer;
    let digestBuffer: Buffer;
    try {
      signatureBuffer = Buffer.from(provided, "hex");
      digestBuffer = Buffer.from(digest, "hex");
    } catch {
      throw new UnauthorizedException("Invalid webhook signature");
    }
    if (signatureBuffer.length !== digestBuffer.length || !timingSafeEqual(signatureBuffer, digestBuffer)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }
  }

  async enqueueEvent(payload: Record<string, unknown>, headers: Record<string, string>) {
    const deliveryId = headers["btcpay-delivery-id"];
    const eventType = headers["btcpay-event"];
    const existing = await this.eventsRepo.findOne({ where: { btcpayDeliveryId: deliveryId } });
    if (existing) {
      return existing;
    }
    const event = this.eventsRepo.create({
      eventType,
      payload,
      btcpayDeliveryId: deliveryId
    });
    const saved = await this.eventsRepo.save(event);
    await this.queue.add(
      "dispatch",
      { eventType, payload, deliveryId },
      { jobId: deliveryId, removeOnComplete: true, removeOnFail: false }
    );
    return saved;
  }
}
