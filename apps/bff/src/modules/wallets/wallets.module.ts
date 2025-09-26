import { Module } from "@nestjs/common";
import { WalletsService } from "./wallets.service";
import { WalletsController } from "./wallets.controller";
import { BtcpyClientModule } from "../../packages";
import { StoresModule } from "../stores/stores.module";

@Module({
  imports: [BtcpyClientModule, StoresModule],
  providers: [WalletsService],
  controllers: [WalletsController]
})
export class WalletsModule {}
