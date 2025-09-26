import { Injectable } from "@nestjs/common";
import { BtcpyClient } from "@paypay/sdk";
import { StoresService } from "../stores/stores.service";

@Injectable()
export class AppsService {
  constructor(private readonly btcpay: BtcpyClient, private readonly storesService: StoresService) {}

  async listStoreApps(storeId: string) {
    const apiKey = await this.storesService.resolveApiKeyForStore(storeId);
    return this.btcpay.apps.list(apiKey, storeId);
  }
}
