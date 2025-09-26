import { Injectable } from "@nestjs/common";
import { BtcpyClient } from "@paypay/sdk";
import { StoresService } from "../stores/stores.service";

@Injectable()
export class WalletsService {
  constructor(private readonly btcpay: BtcpyClient, private readonly storesService: StoresService) {}

  async getWalletSnapshot(storeId: string) {
    const apiKey = await this.storesService.resolveApiKeyForStore(storeId);
    return this.btcpay.wallets.getWalletBalance(apiKey, storeId);
  }

  async listTransactions(storeId: string) {
    const apiKey = await this.storesService.resolveApiKeyForStore(storeId);
    return this.btcpay.wallets.listTransactions(apiKey, storeId, { limit: 50 });
  }
}
