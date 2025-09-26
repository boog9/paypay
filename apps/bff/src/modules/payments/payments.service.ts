import { Injectable } from "@nestjs/common";
import { BtcpyClient } from "@paypay/sdk";
import { StoresService } from "../stores/stores.service";

@Injectable()
export class PaymentsService {
  constructor(private readonly btcpay: BtcpyClient, private readonly storesService: StoresService) {}

  async listInvoices(storeId: string) {
    const apiKey = await this.storesService.resolveApiKeyForStore(storeId);
    return this.btcpay.invoices.listInvoices(apiKey, storeId, { limit: 50 });
  }

  async createInvoice(storeId: string, payload: Record<string, unknown>) {
    const apiKey = await this.storesService.resolveApiKeyForStore(storeId);
    return this.btcpay.invoices.createInvoice(apiKey, storeId, payload);
  }

  async listPaymentRequests(storeId: string) {
    const apiKey = await this.storesService.resolveApiKeyForStore(storeId);
    return this.btcpay.paymentRequests.list(apiKey, storeId);
  }

  async listPullPayments(storeId: string) {
    const apiKey = await this.storesService.resolveApiKeyForStore(storeId);
    return this.btcpay.pullPayments.list(apiKey, storeId);
  }
}
