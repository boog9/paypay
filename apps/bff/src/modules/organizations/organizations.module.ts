import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Organization } from "./entities/organization.entity";
import { Membership } from "./entities/membership.entity";
import { OrganizationsService } from "./organizations.service";
import { OrganizationsController } from "./organizations.controller";
import { BtcpyClientModule } from "../../packages";

@Module({
  imports: [TypeOrmModule.forFeature([Organization, Membership]), BtcpyClientModule],
  providers: [OrganizationsService],
  controllers: [OrganizationsController],
  exports: [OrganizationsService]
})
export class OrganizationsModule {}
