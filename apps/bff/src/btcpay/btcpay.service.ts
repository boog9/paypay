import { Inject, Injectable } from '@nestjs/common';
import type {
  BTCPayClient,
  CreateInvoiceRequest,
  Invoice,
  Store
} from '@paypay/sdk';
import { BTCPAY_CLIENT } from './btcpay.tokens';

@Injectable()
export class BtcpayService {
  constructor(@Inject(BTCPAY_CLIENT) private readonly client: BTCPayClient) {}

  listStores(): Promise<Store[]> {
    return this.client.listStores();
  }

  createInvoice(storeId: string, payload: CreateInvoiceRequest): Promise<Invoice> {
    return this.client.createInvoice(storeId, payload);
  }

  getInvoice(storeId: string, invoiceId: string): Promise<Invoice> {
    return this.client.getInvoice(storeId, invoiceId);
  }
}
