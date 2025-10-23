import axios, { AxiosError, AxiosInstance } from 'axios';
import { Repository } from 'typeorm';
import { BtcpayPaymentMethodsService } from '../src/btcpay/btcpay.payment-methods.service';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';
import { EnvelopeEncryptionService } from '../src/security/envelope-encryption.service';
import { BtcpayService } from '../src/btcpay/btcpay.service';
import { BTCPayAuthError, BTCPayUpstreamError } from '../src/btcpay/btcpay.errors';

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

    const result = await service.previewOnchain(
      store.btcpayStoreId,
      'btc',
      {
        config: {
          derivationScheme: 'tpubDexample',
          accountKeyPath: "1234abcd/84'/1'/0'"
        }
      },
      { store }
    );

    expect(result.addresses).toHaveLength(10);
    expect(result.paymentMethodId).toBe('BTC-CHAIN');
    expect(result.currency).toBe('BTC');
    expect(Object.prototype.hasOwnProperty.call(result, 'derivationScheme')).toBe(false);
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

  // legacy fallback behaviour has been removed; tests cover the modern endpoint exclusively.

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

    const result = await service.updateOnchain(
      store.btcpayStoreId,
      'BTC',
      {
        enabled: true,
        config: {
          derivationScheme: 'xpub6Example',
          accountKeyPath: "abcdef12/84'/0'/0'"
        }
      },
      { store }
    );

    expect(result.enabled).toBe(true);
    expect(result.paymentMethodId).toBe('BTC-CHAIN');
    expect(result.currency).toBe('BTC');
    expect(result.config.accountKeyPath).toBe("84'/0'/0'");
    expect(result.config.masterFingerprint).toBe('abcdef12');
    expect(result.config.derivationScheme).toBe('xpub6Example');
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

  it('updates an on-chain payment method with a temporary key', async () => {
    const putMock = jest.fn().mockResolvedValue({ data: {} });

    mockedAxios.create.mockReturnValue(
      mockAxiosInstance({ put: putMock })
    );

    const service = buildService();

    await service.updateOnchainPaymentMethod(
      {
        storeId: store.btcpayStoreId,
        cryptoCode: 'btc',
        derivationScheme: 'xpubTemp',
        accountKeyPath: "m/84'/0'/0'",
        masterFingerprint: 'abcd1234',
        label: 'Temporary import',
        enabled: true
      },
      { store, apiKey: 'temporary-key' }
    );

    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'token temporary-key' })
      })
    );

    expect(putMock).toHaveBeenCalledWith(
      '/api/v1/stores/store-123/payment-methods/BTC-CHAIN',
      {
        enabled: true,
        config: {
          derivationScheme: 'xpubTemp',
          accountKeyPath: "m/84'/0'/0'",
          masterFingerprint: 'ABCD1234',
          label: 'Temporary import'
        }
      }
    );
  });

  it('throws BTCPayAuthError on 401 when updating with temporary key', async () => {
    const error = {
      isAxiosError: true,
      response: { status: 401 }
    } as AxiosError;
    const putMock = jest.fn().mockRejectedValue(error);

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ put: putMock }));

    const service = buildService();

    await expect(
      service.updateOnchainPaymentMethod(
        {
          storeId: store.btcpayStoreId,
          cryptoCode: 'BTC',
          derivationScheme: 'xpubAuth'
        },
        { store, apiKey: 'temp-key' }
      )
    ).rejects.toBeInstanceOf(BTCPayAuthError);
  });

  it('throws BTCPayUpstreamError on unexpected status when updating with temporary key', async () => {
    const error = {
      isAxiosError: true,
      response: { status: 500 }
    } as AxiosError;
    const putMock = jest.fn().mockRejectedValue(error);

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ put: putMock }));

    const service = buildService();

    await expect(
      service.updateOnchainPaymentMethod(
        {
          storeId: store.btcpayStoreId,
          cryptoCode: 'BTC',
          derivationScheme: 'xpubError'
        },
        { store, apiKey: 'temp-key' }
      )
    ).rejects.toBeInstanceOf(BTCPayUpstreamError);
  });
});
