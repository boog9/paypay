import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EmailRecipient } from "./entities/email-recipient.entity";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [TypeOrmModule.forFeature([EmailRecipient])],
  providers: [NotificationsService],
  exports: [NotificationsService]
})
export class NotificationsModule {}
