import axios, { AxiosError, AxiosInstance } from 'axios';
import { Repository } from 'typeorm';
import { BtcpayPaymentMethodsService } from '../src/btcpay/btcpay.payment-methods.service';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';
import { EnvelopeEncryptionService } from '../src/security/envelope-encryption.service';
import { BtcpayService } from '../src/btcpay/btcpay.service';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BtcpayPaymentMethodsService', () => {
  const store: ManagedStoreEntity = {
    id: 'local-store-id',
    userId: 'user-123',
    btcpayStoreId: 'store-123',
    btcpayHost: 'https://btcpay.example',
    storeName: 'Demo store',
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

  const repository = {
    findOne: jest.fn()
  } as unknown as Repository<ManagedStoreEntity>;

  const encryptionService = {
    decrypt: jest.fn().mockReturnValue('store-api-key')
  } as unknown as EnvelopeEncryptionService;

  const btcpayService = {
    resolveBaseUrl: jest.fn().mockImplementation((host?: string) => (host ? host.replace(/\/$/, '') : 'https://btcpay.example'))
  } as unknown as BtcpayService;

  beforeEach(() => {
    jest.clearAllMocks();
    (encryptionService.decrypt as jest.Mock).mockClear();
    mockedAxios.create.mockReset();
    mockedAxios.isAxiosError.mockReset?.();
    mockedAxios.isAxiosError.mockImplementation(
      (candidate: unknown): candidate is AxiosError => Boolean(candidate && (candidate as { isAxiosError?: boolean }).isAxiosError)
    );
  });

  function buildService(): BtcpayPaymentMethodsService {
    return new BtcpayPaymentMethodsService(repository, encryptionService, btcpayService);
  }

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

  it('previews 10 addresses for a proposed on-chain configuration', async () => {
    const addresses = Array.from({ length: 10 }, (_, index) => ({
      address: `bcrt1qaddress${index}`,
      keyPath: `0/${index}`,
      index
    }));

    const postMock = jest.fn().mockResolvedValue({
      data: {
        currency: 'btc',
        addresses,
        config: {
          derivationScheme: 'tpubDexample',
          accountKeyPath: "1234abcd/84'/1'/0'"
        }
      }
    });

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ post: postMock }));

    const service = buildService();

    const result = await service.previewOnchain(store.btcpayStoreId, 'btc', {
      derivationScheme: 'tpubDexample',
      accountKeyPath: "1234abcd/84'/1'/0'"
    }, { store });

    expect(result.addresses).toHaveLength(10);
    expect(result.paymentMethodId).toBe('BTC-CHAIN');
    expect(result.currency).toBe('BTC');
    expect(result.cryptoCode).toBe('BTC');
    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://btcpay.example',
        headers: expect.objectContaining({ Authorization: 'token store-api-key' })
      })
    );
    expect(postMock).toHaveBeenCalledTimes(1);
    const [path, payload] = postMock.mock.calls[0];
    expect(path).toBe('/api/v1/stores/store-123/payment-methods/BTC-CHAIN/wallet/preview');
    expect(payload).toEqual({
      offset: 0,
      amount: 10,
      config: {
        derivationScheme: 'tpubDexample',
        accountKeyPath: "1234abcd/84'/1'/0'"
      }
    });
  });

  it('omits empty config objects when previewing', async () => {
    const postMock = jest.fn().mockResolvedValue({
      data: {
        currency: 'btc',
        addresses: [
          { address: 'bc1qexample0', keyPath: '0/0', index: 0 },
          { address: 'bc1qexample1', keyPath: '0/1', index: 1 }
        ]
      }
    });

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ post: postMock }));

    const service = buildService();

    await service.previewOnchain(store.btcpayStoreId, 'btc', undefined, { store });

    expect(postMock).toHaveBeenCalledTimes(1);
    const [, payload] = postMock.mock.calls[0];
    expect(payload).toEqual({
      offset: 0,
      amount: 10
    });
  });

  it('falls back to legacy preview when the modern endpoint is unavailable', async () => {
    const previewError: AxiosError = {
      isAxiosError: true,
      name: 'AxiosError',
      message: 'not found',
      config: {},
      toJSON: () => ({}),
      response: {
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: {},
        data: { message: 'not found' }
      }
    } as AxiosError;

    const addresses = Array.from({ length: 10 }, (_, index) => ({
      address: `bcrt1qlegacy${index}`,
      keyPath: `0/${index}`,
      index
    }));

    const postMock = jest.fn().mockImplementation((url: string) => {
      if (url.includes('payment-methods/BTC-CHAIN/wallet/preview')) {
        return Promise.reject(previewError);
      }
      throw new Error(`Unexpected POST to ${url}`);
    });

    const getMock = jest.fn().mockImplementation((url: string) => {
      if (url.includes('payment-methods/OnChain/BTC/preview')) {
        return Promise.resolve({
          data: {
            cryptoCode: 'BTC',
            addresses
          }
        });
      }
      throw new Error(`Unexpected GET to ${url}`);
    });

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock, post: postMock }));

    const service = buildService();

    const result = await service.previewOnchain(
      store.btcpayStoreId,
      'btc',
      {
        derivationScheme: 'tpubDexample',
        accountKeyPath: "m/84'/0'/0'",
        label: 'Demo label'
      },
      { store }
    );

    expect(result.currency).toBe('BTC');
    expect(result.cryptoCode).toBe('BTC');
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls[0][0]).toBe('/api/v1/stores/store-123/payment-methods/BTC-CHAIN/wallet/preview');
    expect(postMock.mock.calls[0][1]).toEqual({
      offset: 0,
      amount: 10,
      config: {
        derivationScheme: 'tpubDexample',
        accountKeyPath: "m/84'/0'/0'",
        label: 'Demo label'
      }
    });
    expect(getMock.mock.calls[0][0]).toBe('/api/v1/stores/store-123/payment-methods/OnChain/BTC/preview');
    expect(getMock.mock.calls[0][1]).toEqual({
      params: {
        offset: '0',
        amount: '10',
        derivationScheme: 'tpubDexample',
        accountKeyPath: "m/84'/0'/0'"
      }
    });
  });

  it('falls back to legacy POST preview when legacy GET is not allowed', async () => {
    const modernError: AxiosError = {
      isAxiosError: true,
      name: 'AxiosError',
      message: 'not found',
      config: {},
      toJSON: () => ({}),
      response: {
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: {},
        data: { message: 'not found' }
      }
    } as AxiosError;

    const legacyError: AxiosError = {
      isAxiosError: true,
      name: 'AxiosError',
      message: 'method not allowed',
      config: {},
      toJSON: () => ({}),
      response: {
        status: 405,
        statusText: 'Method Not Allowed',
        headers: {},
        config: {},
        data: { message: 'method not allowed' }
      }
    } as AxiosError;

    const addresses = Array.from({ length: 10 }, (_, index) => ({
      address: `bcrt1qlegacy-post${index}`,
      keyPath: `0/${index}`,
      index
    }));

    const postMock = jest.fn().mockImplementation((url: string, data?: unknown) => {
      if (url.includes('payment-methods/BTC-CHAIN/wallet/preview')) {
        return Promise.reject(modernError);
      }
      if (url.includes('payment-methods/OnChain/BTC/preview')) {
        return Promise.resolve({
          data: {
            cryptoCode: 'BTC',
            addresses
          }
        });
      }
      throw new Error(`Unexpected POST to ${url} with data ${JSON.stringify(data)}`);
    });

    const getMock = jest.fn().mockImplementation((url: string) => {
      if (url.includes('payment-methods/BTC-CHAIN/wallet/preview')) {
        return Promise.reject(modernError);
      }
      return Promise.reject(legacyError);
    });

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock, post: postMock }));

    const service = buildService();

    const result = await service.previewOnchain(store.btcpayStoreId, 'btc', {
      derivationScheme: 'tpubDexample'
    }, { store });

    expect(result.addresses).toHaveLength(10);
    expect(result.cryptoCode).toBe('BTC');
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledTimes(2);
    expect(postMock.mock.calls[0][0]).toBe('/api/v1/stores/store-123/payment-methods/BTC-CHAIN/wallet/preview');
    expect(postMock.mock.calls[0][1]).toEqual({
      offset: 0,
      amount: 10,
      config: { derivationScheme: 'tpubDexample' }
    });
    expect(getMock.mock.calls[0][0]).toBe('/api/v1/stores/store-123/payment-methods/OnChain/BTC/preview');
    expect(getMock.mock.calls[0][1]).toEqual({
      params: {
        offset: '0',
        amount: '10',
        derivationScheme: 'tpubDexample'
      }
    });
    expect(postMock.mock.calls[1][0]).toBe('/api/v1/stores/store-123/payment-methods/OnChain/BTC/preview');
    expect(postMock.mock.calls[1][1]).toEqual({
      derivationScheme: 'tpubDexample',
      offset: 0,
      amount: 10
    });
  });

  it('returns enabled flag and normalized key path after updating the on-chain method', async () => {
    const putMock = jest.fn().mockResolvedValue({
      data: {
        enabled: true,
        paymentMethodId: 'BTC-CHAIN',
        currency: 'btc',
        config: {
          derivationScheme: 'xpub6Example',
          accountKeySettings: [
            { accountKeyPath: "84'/0'/0'", rootFingerprint: 'abcdef12' }
          ]
        }
      }
    });

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ put: putMock }));

    const service = buildService();

    const result = await service.updateOnchain(store.btcpayStoreId, 'BTC', {
      enabled: true,
      derivationScheme: 'xpub6Example',
      accountKeyPath: "abcdef12/84'/0'/0'"
    }, { store });

    expect(result.enabled).toBe(true);
    expect(result.accountKeyPath).toBe("84'/0'/0'");
    expect(result.masterFingerprint).toBe('abcdef12');
    expect(result.paymentMethodId).toBe('BTC-CHAIN');
    expect(result.currency).toBe('BTC');
    expect(result.cryptoCode).toBe('BTC');
    expect(putMock).toHaveBeenCalledWith(
      '/api/v1/stores/store-123/payment-methods/BTC-CHAIN',
      expect.objectContaining({
        enabled: true,
        config: expect.objectContaining({
          derivationScheme: 'xpub6Example',
          accountKeyPath: "abcdef12/84'/0'/0'"
        })
      })
    );
  });
});
