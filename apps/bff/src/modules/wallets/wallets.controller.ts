import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { WalletsService } from "./wallets.service";

@ApiTags("wallets")
@ApiBearerAuth()
@Controller("stores/:storeId/wallets")
@UseGuards(AuthGuard("jwt"))
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get("balance")
  balance(@Param("storeId") storeId: string) {
    return this.walletsService.getWalletSnapshot(storeId);
  }

  @Get("transactions")
  transactions(@Param("storeId") storeId: string) {
    return this.walletsService.listTransactions(storeId);
  }
}
