import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { StoresService } from "./stores.service";

@ApiTags("stores")
@ApiBearerAuth()
@Controller("stores")
@UseGuards(AuthGuard("jwt"))
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get(":storeId/overview")
  overview(@Param("storeId") storeId: string) {
    return this.storesService.getStoreOverview(storeId);
  }

  @Post(":storeId/archive")
  archive(@Param("storeId") storeId: string, @Body("reason") reason?: string) {
    return this.storesService.archiveStore(storeId, reason);
  }
}
