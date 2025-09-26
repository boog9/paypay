import { Module } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { BtcpyClientModule } from "../../packages";
import { StoresModule } from "../stores/stores.module";

@Module({
  imports: [BtcpyClientModule, StoresModule],
  providers: [PaymentsService],
  controllers: [PaymentsController]
})
export class PaymentsModule {}
