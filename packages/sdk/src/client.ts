import axios, { type AxiosInstance } from 'axios';
import type { components } from './gen/btcpay';

export type Store = components['schemas']['StoreData'];
export type CreateInvoiceRequest = components['schemas']['CreateInvoiceRequest'];
export type Invoice = components['schemas']['InvoiceData'];

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

function normaliseBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function createBTCPayClient(config: BTCPayClientConfig): BTCPayClient {
  const http: AxiosInstance = axios.create({
    baseURL: normaliseBaseUrl(config.baseUrl),
    timeout: config.timeoutMs ?? 10_000,
    headers: {
      Authorization: `token ${config.apiKey}`,
      Accept: 'application/json'
    }
  });

  return {
    async listStores() {
      const { data } = await http.get<Store[]>('/api/v1/stores');
      return data;
    },
    async createInvoice(storeId, payload) {
      const { data } = await http.post<Invoice>(`/api/v1/stores/${storeId}/invoices`, payload);
      return data;
    },
    async getInvoice(storeId, invoiceId) {
      const { data } = await http.get<Invoice>(`/api/v1/stores/${storeId}/invoices/${invoiceId}`);
      return data;
    }
  };
}
