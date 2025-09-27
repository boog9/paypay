declare module '@paypay/sdk' {
  export interface Store {
    id: string;
    name: string;
    [key: string]: unknown;
  }

  export interface CreateInvoiceRequest {
    [key: string]: unknown;
  }

  export interface Invoice {
    id: string;
    status?: string;
    [key: string]: unknown;
  }

  export interface BTCPayClientConfig {
    baseUrl: string;
    apiKey: string;
    timeoutMs?: number;
  }

  export interface BTCPayClient {
    listStores(): Promise<Store[]>;
    createInvoice(storeId: string, payload: CreateInvoiceRequest): Promise<Invoice>;
    getInvoice(storeId: string, invoiceId: string): Promise<Invoice>;
  }

  export function createBTCPayClient(config: BTCPayClientConfig): BTCPayClient;
}
