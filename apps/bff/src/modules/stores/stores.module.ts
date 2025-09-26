import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { StoreBinding } from "./entities/store-binding.entity";
import { ArchiveFlag } from "./entities/archive-flag.entity";
import { StoresService } from "./stores.service";
import { StoresController } from "./stores.controller";
import { BtcpyClientModule } from "../../packages";

@Module({
  imports: [TypeOrmModule.forFeature([StoreBinding, ArchiveFlag]), BtcpyClientModule],
  providers: [StoresService],
  controllers: [StoresController],
  exports: [StoresService]
})
export class StoresModule {}
