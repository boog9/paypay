import { Controller, Get, Param } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SettingsService } from "./settings.service";

@ApiTags("settings")
@ApiBearerAuth()
@Controller("stores/:storeId/settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get("emails")
  emails(@Param("storeId") storeId: string) {
    return this.settingsService.listEmailRecipients(storeId);
  }
}
