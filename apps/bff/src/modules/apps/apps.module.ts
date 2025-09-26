import { Module } from "@nestjs/common";
import { AppsService } from "./apps.service";
import { AppsController } from "./apps.controller";
import { BtcpyClientModule } from "../../packages";
import { StoresModule } from "../stores/stores.module";

@Module({
  imports: [BtcpyClientModule, StoresModule],
  providers: [AppsService],
  controllers: [AppsController]
})
export class AppsModule {}
