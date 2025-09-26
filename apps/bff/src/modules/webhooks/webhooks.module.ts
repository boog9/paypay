import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bullmq";
import { WebhooksController } from "./webhooks.controller";
import { WebhookEventLog } from "./entities/webhook-event-log.entity";
import { WebhooksService } from "./webhooks.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { WebhookWorker } from "./workers/webhook.worker";

@Module({
  imports: [TypeOrmModule.forFeature([WebhookEventLog]), BullModule.registerQueue({ name: "webhooks" }), NotificationsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookWorker]
})
export class WebhooksModule {}
