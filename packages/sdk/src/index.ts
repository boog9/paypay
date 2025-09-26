import axios, { AxiosInstance } from "axios";

type ClientConfig = {
  baseUrl: string;
  defaultApiKey?: string;
};

type PaginationOptions = {
  limit?: number;
  skip?: number;
};

export class BtcpyClient {
  private readonly http: AxiosInstance;
  private readonly defaultApiKey?: string;

  constructor(config: ClientConfig) {
    this.http = axios.create({
      baseURL: config.baseUrl,
      timeout: 10_000
    });
    this.defaultApiKey = config.defaultApiKey;
  }

  private authHeader(apiKey?: string) {
    const key = apiKey ?? this.defaultApiKey;
    return key ? { Authorization: `token ${key}` } : {};
  }

  readonly stores = {
    listStores: async (apiKey: string) => {
      const { data } = await this.http.get<StoreSummary[]>("/api/v1/stores", {
        headers: this.authHeader(apiKey)
      });
      return data;
    }
  };

  readonly invoices = {
    listInvoices: async (apiKey: string, storeId: string, options: PaginationOptions = {}) => {
      const { data } = await this.http.get<InvoiceSummary[]>(`/api/v1/stores/${storeId}/invoices`, {
        headers: this.authHeader(apiKey),
        params: options
      });
      return data;
    },
    createInvoice: async (apiKey: string, storeId: string, payload: Record<string, unknown>) => {
      const { data } = await this.http.post<InvoiceSummary>(
        `/api/v1/stores/${storeId}/invoices`,
        payload,
        {
          headers: this.authHeader(apiKey)
        }
      );
      return data;
    }
  };

  readonly paymentRequests = {
    list: async (apiKey: string, storeId: string) => {
      const { data } = await this.http.get<PaymentRequestSummary[]>(
        `/api/v1/stores/${storeId}/payment-requests`,
        { headers: this.authHeader(apiKey) }
      );
      return data;
    }
  };

  readonly pullPayments = {
    list: async (apiKey: string, storeId: string) => {
      const { data } = await this.http.get<PullPaymentSummary[]>(
        `/api/v1/stores/${storeId}/pull-payments`,
        { headers: this.authHeader(apiKey) }
      );
      return data;
    },
    payouts: async (apiKey: string, storeId: string, pullPaymentId: string) => {
      const { data } = await this.http.get<PayoutSummary[]>(
        `/api/v1/stores/${storeId}/pull-payments/${pullPaymentId}/payouts`,
        { headers: this.authHeader(apiKey) }
      );
      return data;
    }
  };

  readonly wallets = {
    getWalletBalance: async (apiKey: string, storeId: string) => {
      const { data } = await this.http.get<WalletBalance>(
        `/api/v1/stores/${storeId}/payment-methods/onchain/BTC/wallet`,
        {
          headers: this.authHeader(apiKey)
        }
      );
      return data;
    },
    listTransactions: async (apiKey: string, storeId: string, options: PaginationOptions = {}) => {
      const { data } = await this.http.get<WalletTransaction[]>(
        `/api/v1/stores/${storeId}/payment-methods/onchain/BTC/wallet/transactions`,
        {
          headers: this.authHeader(apiKey),
          params: options
        }
      );
      return data;
    }
  };

  readonly payouts = {
    listPayouts: async (apiKey: string, storeId: string, options: PaginationOptions = {}) => {
      const { data } = await this.http.get<PayoutSummary[]>(
        `/api/v1/stores/${storeId}/payouts`,
        { headers: this.authHeader(apiKey), params: options }
      );
      return data;
    }
  };

  readonly apps = {
    list: async (apiKey: string, storeId: string) => {
      const { data } = await this.http.get<AppSummary[]>(`/api/v1/stores/${storeId}/apps`, {
        headers: this.authHeader(apiKey)
      });
      return data;
    }
  };
}

export type StoreSummary = {
  id: string;
  name: string;
  defaultCurrency: string;
};

export type InvoiceSummary = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  createdTime: string;
};

export type PaymentRequestSummary = {
  id: string;
  title: string;
  amount: number;
  currency: string;
};

export type PullPaymentSummary = {
  id: string;
  name: string;
  amount: number;
  currency: string;
};

export type PayoutSummary = {
  id: string;
  state: string;
  amount: number;
  paymentMethod: string;
};

export type WalletBalance = Record<string, unknown>;

export type WalletTransaction = {
  txId: string;
  amount: number;
  timestamp: number;
};

export type AppSummary = {
  id: string;
  name: string;
  type: string;
};
