import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AppsService } from "./apps.service";

@ApiTags("apps")
@ApiBearerAuth()
@Controller("stores/:storeId/apps")
@UseGuards(AuthGuard("jwt"))
export class AppsController {
  constructor(private readonly appsService: AppsService) {}

  @Get()
  list(@Param("storeId") storeId: string) {
    return this.appsService.listStoreApps(storeId);
  }
}
