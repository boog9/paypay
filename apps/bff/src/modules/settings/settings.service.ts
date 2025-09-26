import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { StoreBinding } from "../stores/entities/store-binding.entity";
import { EmailRecipient } from "../notifications/entities/email-recipient.entity";

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(StoreBinding) private readonly storesRepo: Repository<StoreBinding>,
    @InjectRepository(EmailRecipient) private readonly emailsRepo: Repository<EmailRecipient>
  ) {}

  async listEmailRecipients(storeId: string) {
    return this.emailsRepo.find({
      where: { store: { id: storeId } },
      relations: { store: true }
    });
  }
}
