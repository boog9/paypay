import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { StoreBinding } from "../stores/entities/store-binding.entity";
import { EmailRecipient } from "../notifications/entities/email-recipient.entity";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";

@Module({
  imports: [TypeOrmModule.forFeature([StoreBinding, EmailRecipient])],
  controllers: [SettingsController],
  providers: [SettingsService]
})
export class SettingsModule {}
