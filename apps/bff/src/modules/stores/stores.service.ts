import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { StoreBinding } from "./entities/store-binding.entity";
import { ArchiveFlag } from "./entities/archive-flag.entity";
import { BtcpyClient } from "@paypay/sdk";

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(StoreBinding) private readonly storesRepo: Repository<StoreBinding>,
    @InjectRepository(ArchiveFlag) private readonly archiveRepo: Repository<ArchiveFlag>,
    private readonly btcpay: BtcpyClient
  ) {}

  async resolveApiKeyForStore(storeId: string): Promise<string> {
    const store = await this.storesRepo.findOne({ where: { id: storeId }, relations: { organization: true } });
    if (!store) throw new NotFoundException("Store not found");
    // TODO: resolve store.apiKeyRef via secret storage once implemented.
    const fallback = process.env.BTCPAY_API_KEY;
    if (!fallback) throw new Error("BTCPAY_API_KEY is not configured");
    return fallback;
  }

  async getStoreOverview(storeId: string) {
    const apiKey = await this.resolveApiKeyForStore(storeId);
    const [invoices, payouts, wallet] = await Promise.all([
      this.btcpay.invoices.listInvoices(apiKey, storeId, { limit: 10 }),
      this.btcpay.payouts.listPayouts(apiKey, storeId, { limit: 10 }),
      this.btcpay.wallets.getWalletBalance(apiKey, storeId)
    ]);
    return {
      invoices,
      payouts,
      wallet
    };
  }

  async archiveStore(storeId: string, reason?: string) {
    const store = await this.storesRepo.findOne({ where: { id: storeId } });
    if (!store) return null;
    const flag = this.archiveRepo.create({ reason });
    await this.archiveRepo.save(flag);
    store.archiveFlag = flag;
    return this.storesRepo.save(store);
  }
}
