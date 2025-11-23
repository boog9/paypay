import { UnprocessableEntityException } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { Repository } from 'typeorm';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';
import { EnvelopeEncryptionService } from '../src/security/envelope-encryption.service';
import { BtcpayWalletService, ListTransactionsResult } from '../src/btcpay/btcpay.wallets.service';
import { BtcpayService } from '../src/btcpay/btcpay.service';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

const store: ManagedStoreEntity = {
  id: 'local-store',
  userId: 'tenant',
  btcpayStoreId: 'store-123',
  btcpayHost: 'https://btcpay.example',
  storeName: 'Demo',
  defaultCurrency: 'USD',
  apiKeyCiphertext: 'cipher',
  apiKeyDekWrapped: 'dek',
  webhookId: null,
  webhookSecretCiphertext: null,
  webhookSecretDekWrapped: null,
  storeKeyLastFour: null,
  lastActiveAt: null,
  createdAt: new Date(),
  updatedAt: new Date()
} as ManagedStoreEntity;

describe('BtcpayWalletService', () => {
  const repository = {
    findOne: jest.fn().mockResolvedValue(store)
  } as unknown as Repository<ManagedStoreEntity>;

  const encryptionService = {
    decrypt: jest.fn().mockReturnValue('store-api-key')
  } as unknown as EnvelopeEncryptionService;

  const btcpayService = {
    resolveBaseUrl: jest.fn().mockReturnValue('https://btcpay.example')
  } as unknown as BtcpayService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.create.mockReset();
    mockedAxios.isAxiosError.mockImplementation(
      (candidate: unknown): candidate is AxiosError =>
        Boolean(candidate && (candidate as { isAxiosError?: boolean }).isAxiosError)
    );
  });

  function mockAxiosInstance(overrides: Partial<AxiosInstance>): AxiosInstance {
    return {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      head: jest.fn(),
      options: jest.fn(),
      patch: jest.fn(),
      request: jest.fn(),
      ...overrides
    } as unknown as AxiosInstance;
  }

  function buildService(): BtcpayWalletService {
    return new BtcpayWalletService(repository, encryptionService, btcpayService);
  }

  it('lists transactions with query parameters', async () => {
    const items = [{ transactionHash: 'abcd' }];
    const getMock = jest.fn().mockResolvedValue({ data: items });
    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

    const service = buildService();

    const result = await service.listTransactions(
      store.btcpayStoreId,
      'btc',
      { skip: 10, count: 25, labels: ['invoice'], order: 'asc' },
      { store }
    );

    expect(getMock).toHaveBeenCalledWith(
      '/api/v1/stores/store-123/payment-methods/BTC-CHAIN/wallet/transactions',
      {
        params: { skip: 10, take: 25, labelFilter: 'invoice', order: 'asc' }
      }
    );

    expect(result).toEqual({ items });
  });

  it('rescans the wallet using the wallet actions endpoint', async () => {
    const postMock = jest.fn().mockResolvedValue({});
    mockedAxios.create.mockReturnValue(mockAxiosInstance({ post: postMock }));

    const service = buildService();

    await service.rescanWallet(store.btcpayStoreId, 'btc', {
      store,
      startIndex: -5,
      gapLimit: undefined
    });

    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/stores/store-123/wallets/BTC/actions/rescan',
      {
        startIndex: 0,
        gapLimit: 10_000,
        batchSize: 3_000
      }
    );
  });

  it('maps error responses to framework exceptions', async () => {
    const error: AxiosError = {
      isAxiosError: true,
      toJSON: () => ({}),
      config: {},
      name: 'AxiosError',
      message: 'Validation failed',
      response: {
        status: 422,
        data: { message: 'Validation failed' },
        statusText: 'Unprocessable',
        headers: {},
        config: {}
      }
    } as AxiosError;

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: jest.fn().mockRejectedValue(error) }));

    const service = buildService();

    await expect(
      service.getOverview(store.btcpayStoreId, 'btc', { store })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('normalizes mixed response payloads', async () => {
    const data: ListTransactionsResult = {
      total: 5,
      items: [
        {
          transactionHash: 'abcd'
        }
      ]
    };

    const getMock = jest.fn().mockResolvedValue({ data: { total: '5', items: data.items } });
    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

    const service = buildService();
    const result = await service.listTransactions(store.btcpayStoreId, 'btc', undefined, { store });

    expect(result.total).toBe(5);
    expect(result.items).toEqual(data.items);
  });

  it('retrieves the current receive address from the BTC-CHAIN endpoint', async () => {
    const addressPayload = { address: 'tb1qexampleaddress' };
    const getMock = jest.fn().mockResolvedValue({ data: addressPayload });
    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

    const service = buildService();
    const result = await service.getReceiveAddress(store.btcpayStoreId, 'btc', { store });

    expect(getMock).toHaveBeenCalledWith(
      '/api/v1/stores/store-123/payment-methods/BTC-CHAIN/wallet/address'
    );
    expect(result).toEqual(addressPayload);
  });

  it('detects wallet presence when BTCPay returns 200', async () => {
    const overviewPayload = { label: 'Demo Wallet' };
    const getMock = jest.fn().mockResolvedValue({ data: overviewPayload });
    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

    const service = buildService();
    const result = await service.getOnchainWalletOverview(store.btcpayStoreId, 'btc', { store });

    expect(getMock).toHaveBeenCalledWith(
      '/api/v1/stores/store-123/payment-methods/BTC-CHAIN/wallet'
    );
    expect(result).toEqual({ hasWallet: true, raw: overviewPayload });
  });

  it('returns hasWallet=false when BTCPay responds with 404', async () => {
    const error: AxiosError = {
      isAxiosError: true,
      toJSON: () => ({}),
      config: {},
      name: 'AxiosError',
      message: 'Wallet not found',
      response: {
        status: 404,
        data: { message: 'Wallet not found' },
        headers: {},
        statusText: 'Not Found',
        config: {}
      }
    } as AxiosError;

    const getMock = jest.fn().mockRejectedValue(error);
    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

    const service = buildService();
    const result = await service.getOnchainWalletOverview(store.btcpayStoreId, 'btc', { store });

    expect(result).toEqual({ hasWallet: false });
  });

  it('rethrows non-404 errors from wallet overview', async () => {
    const error: AxiosError = {
      isAxiosError: true,
      toJSON: () => ({}),
      config: {},
      name: 'AxiosError',
      message: 'Forbidden',
      response: {
        status: 403,
        data: { message: 'Forbidden' },
        headers: {},
        statusText: 'Forbidden',
        config: {}
      }
    } as AxiosError;

    const getMock = jest.fn().mockRejectedValue(error);
    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

    const service = buildService();

    await expect(
      service.getOnchainWalletOverview(store.btcpayStoreId, 'btc', { store })
    ).rejects.toHaveProperty('status', 403);
  });
});
