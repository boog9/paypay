import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EmailRecipient } from "./entities/email-recipient.entity";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@InjectRepository(EmailRecipient) private readonly emailsRepo: Repository<EmailRecipient>) {}

  async dispatchInvoiceSettled(storeId: string, payload: Record<string, unknown>) {
    const recipients = await this.emailsRepo.find({ where: { store: { id: storeId } } });
    this.logger.log(`Dispatching invoice-settled notification to ${recipients.length} recipients`, {
      storeId,
      invoiceId: payload["invoiceId"]
    });
  }
}
