import { Inject, Injectable } from '@nestjs/common';
import type {
  BTCPayClient,
  CreateInvoiceRequest,
  Invoice,
  Store
} from '@paypay/sdk';
import { BTCPAY_CLIENT, BTCPAY_CONFIG, type BtcpayConfig } from './btcpay.tokens';
import { BTCPAY_MINIMAL_PERMISSIONS } from './btcpay.constants';

@Injectable()
export class BtcpayService {
  constructor(
    @Inject(BTCPAY_CLIENT) private readonly client: BTCPayClient,
    @Inject(BTCPAY_CONFIG) private readonly config: BtcpayConfig
  ) {}

  listStores(): Promise<Store[]> {
    return this.client.listStores();
  }

  createInvoice(storeId: string, payload: CreateInvoiceRequest): Promise<Invoice> {
    return this.client.createInvoice(storeId, payload);
  }

  getInvoice(storeId: string, invoiceId: string): Promise<Invoice> {
    return this.client.getInvoice(storeId, invoiceId);
  }

  buildAuthorizeUserUrl(params: { storeId: string; applicationName: string; redirectUrl: string }): string {
    const baseUrl = new URL(this.config.baseUrl);
    const authorizeUrl = new URL('/api-keys/authorize', baseUrl);
    authorizeUrl.searchParams.set('applicationName', params.applicationName);
    authorizeUrl.searchParams.set('redirectUrl', params.redirectUrl);
    authorizeUrl.searchParams.set('storeId', params.storeId);
    authorizeUrl.searchParams.set('permissions', BTCPAY_MINIMAL_PERMISSIONS.join(','));
    return authorizeUrl.toString();
  }
}
