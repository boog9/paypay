import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { NotificationsService } from "../../notifications/notifications.service";

@Processor("webhooks")
export class WebhookWorker extends WorkerHost {
  constructor(private readonly notificationsService: NotificationsService) {
    super();
  }

  async process(job: Job<{ eventType: string; payload: Record<string, unknown>; deliveryId: string }>) {
    if (job.name !== "dispatch") return;
    const { eventType, payload } = job.data;

    switch (eventType) {
      case "InvoiceSettled":
        await this.notificationsService.dispatchInvoiceSettled(String(payload["storeId"]), payload);
        break;
      default:
        break;
    }
  }
}
