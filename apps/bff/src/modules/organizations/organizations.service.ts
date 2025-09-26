import { Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Organization } from "./entities/organization.entity";
import { Membership } from "./entities/membership.entity";
import { BtcpyClient } from "@paypay/sdk";

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization) private readonly organizationsRepo: Repository<Organization>,
    @InjectRepository(Membership) private readonly membershipsRepo: Repository<Membership>,
    private readonly btcpay: BtcpyClient
  ) {}

  async listOrganizationsForUser(userId?: string) {
    if (!userId) throw new UnauthorizedException();
    return this.organizationsRepo
      .createQueryBuilder("organization")
      .leftJoin("organization.memberships", "membership")
      .where("membership.user_id = :userId", { userId })
      .getMany();
  }

  async syncStores(organization: Organization, apiKey: string) {
    const stores = await this.btcpay.stores.listStores(apiKey);
    return stores.map((store) => ({
      id: store.id,
      name: store.name,
      defaultCurrency: store.defaultCurrency
    }));
  }
}
