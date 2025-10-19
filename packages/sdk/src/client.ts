import type { components } from './gen/btcpay';

const DEFAULT_TIMEOUT_MS = 10_000;

export class BTCPayClientError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number, cause?: unknown) {
    super(message);
    this.name = 'BTCPayClientError';
    this.status = status;
    if (cause !== undefined) {
      try {
        (this as Error & { cause?: unknown }).cause = cause;
      } catch {
        // Older runtimes may not support setting a cause property; ignore silently.
      }
    }
  }
}

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

function ensureLeadingSlash(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

async function parseJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createBTCPayClient(config: BTCPayClientConfig): BTCPayClient {
  const baseUrl = normaliseBaseUrl(config.baseUrl);
  if (!baseUrl) {
    throw new BTCPayClientError('BTCPay base URL must be a non-empty string.');
  }

  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const headers: HeadersInit = {
      Authorization: `token ${config.apiKey}`,
      Accept: 'application/json',
      ...init.headers
    };

    const finalInit: RequestInit = {
      ...init,
      headers,
      signal: controller.signal
    };

    try {
      const target = `${baseUrl}${ensureLeadingSlash(path)}`;
      const response = await fetch(target, finalInit);
      const body = await parseJsonBody(response);

      if (!response.ok) {
        const message =
          typeof body === 'object' && body !== null && 'message' in body
            ? String((body as { message: unknown }).message)
            : `BTCPay request failed with status ${response.status}`;
        throw new BTCPayClientError(message, response.status, body);
      }

      if (body === undefined) {
        throw new BTCPayClientError('BTCPay response did not include a JSON payload.', response.status);
      }

      return body as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new BTCPayClientError('BTCPay request timed out.', undefined, error);
      }
      if (error instanceof BTCPayClientError) {
        throw error;
      }
      throw new BTCPayClientError('Unexpected error while communicating with BTCPay.', undefined, error);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async listStores() {
      return request<Store[]>('/api/v1/stores');
    },
    async createInvoice(storeId, payload) {
      return request<Invoice>(`/api/v1/stores/${storeId}/invoices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    },
    async getInvoice(storeId, invoiceId) {
      return request<Invoice>(`/api/v1/stores/${storeId}/invoices/${invoiceId}`);
    }
  };
}
