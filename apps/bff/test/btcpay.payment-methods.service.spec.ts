import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance, AxiosHeaders } from 'axios';
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
    btcpayStoreId: 'JDm5GuV',
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

  const SAMPLE_TPUB =
    "tpubDD5xrqbhiqeA6fm64AKHGp7q8C5fuRJK7hDmUf3JiWG9jKvRWMHSeGD9uZBizHqa56yVzRFvQ61R8o7LozB6QCxxeg9Tv3AgsUJGkZeYkbq";
  const SAMPLE_XPUB =
    "xpub6DQr6ATUNo26pU5ViMmd5eLYCoqUhZMN52JhppqmjdBng2mMPmGhBX4F1p7nyTLMEScjUC2hRuME3Pw9WvctsVkb3tUSVs9HmLxxdKqKwHx";

  beforeEach(() => {
    jest.clearAllMocks();
    (encryptionService.decrypt as jest.Mock).mockClear();
    mockedAxios.create.mockReset();
    mockedAxios.isAxiosError.mockReset?.();
    mockedAxios.isAxiosError.mockImplementation(
      (candidate: unknown): candidate is AxiosError => Boolean(candidate && (candidate as { isAxiosError?: boolean }).isAxiosError)
    );
    (repository.findOne as unknown as jest.Mock).mockResolvedValue(store);
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

  it('previews proposed on-chain addresses via wallet preview endpoint', async () => {
    const getMock = jest.fn().mockResolvedValue({
      data: {
        addresses: [
          { address: 'tb1qexample0', keyPath: '0/0', index: 0 },
          { address: 'tb1qexample1', keyPath: '0/1', index: 1 }
        ]
      }
    });

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

    const service = buildService();

    const result = await service.previewOnchainAddresses(store, {
      derivationScheme: SAMPLE_TPUB,
      accountKeyPath: "m/84'/1'/0'",
    });

    expect(result.addresses).toHaveLength(2);
    expect(getMock).toHaveBeenCalledWith(
      '/api/v1/stores/JDm5GuV/payment-methods/BTC-CHAIN/wallet/preview',
      {
        params: {
          offset: '0',
          count: '10',
          derivationScheme: SAMPLE_TPUB,
          accountKeyPath: "m/84'/1'/0'"
        }
      }
    );
  });

  it('omits optional fields when previewing without additional metadata', async () => {
    const getMock = jest.fn().mockResolvedValue({ data: { addresses: [] } });

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

    const service = buildService();

    await service.previewOnchainAddresses(store, { derivationScheme: SAMPLE_TPUB });

    expect(getMock).toHaveBeenCalledWith(
      '/api/v1/stores/JDm5GuV/payment-methods/BTC-CHAIN/wallet/preview',
      {
        params: {
          offset: '0',
          count: '10',
          derivationScheme: SAMPLE_TPUB
        }
      }
    );
  });

  it('generates on-chain wallet metadata via wallet generate endpoint', async () => {
    const postMock = jest.fn().mockResolvedValue({
      data: {
        enabled: true,
        paymentMethodId: 'BTC-CHAIN',
        config: {
          derivationScheme: SAMPLE_TPUB,
          accountKeyPath: "m/84'/1'/0'",
          masterFingerprint: '10B3BFC0',
          label: 'Primary'
        }
      }
    });

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ post: postMock }));

    const service = buildService();

    const result = await service.generateOnchainWallet(
      store,
      {
        derivationScheme: SAMPLE_TPUB,
        accountKeyPath: "m/84'/1'/0'",
        masterFingerprint: '10b3bfc0',
        label: 'Primary'
      }
    );

    expect(result).toEqual({
      storeId: store.btcpayStoreId,
      paymentMethodId: 'BTC-CHAIN',
      enabled: true,
      config: {
        derivationScheme: SAMPLE_TPUB,
        accountKeyPath: "84'/1'/0'",
        masterFingerprint: '10B3BFC0',
        label: 'Primary'
      }
    });
    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/stores/JDm5GuV/payment-methods/BTC-CHAIN/wallet/generate',
      {
        derivationScheme: SAMPLE_TPUB,
        accountKeyPath: "m/84'/1'/0'",
        masterFingerprint: '10B3BFC0',
        label: 'Primary'
      }
    );
  });

  it('maps generate validation errors to UnprocessableEntityException', async () => {
    const response = {
      status: 422,
      statusText: 'Unprocessable Entity',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: 'Invalid derivation'
    } as any;
    const axiosError = new AxiosError(
      'Invalid derivation',
      'ERR_BAD_REQUEST',
      { headers: new AxiosHeaders() },
      undefined,
      response
    );
    axiosError.response = response;
    axiosError.isAxiosError = true;

    const postMock = jest.fn().mockRejectedValue(axiosError);
    mockedAxios.create.mockReturnValue(mockAxiosInstance({ post: postMock }));

    const service = buildService();

    expect.assertions(4);

    try {
      await service.generateOnchainWallet(store, { derivationScheme: SAMPLE_TPUB });
    } catch (error) {
      expect(postMock).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      if (!(error instanceof UnprocessableEntityException)) {
        throw error;
      }
      const httpError = error;
      expect(httpError.getStatus()).toBe(422);
      const responsePayload = httpError.getResponse();
      if (typeof responsePayload === 'string') {
        expect(responsePayload).toBe('Invalid derivation');
      } else {
        expect((responsePayload as { message?: string }).message).toBe('Invalid derivation');
      }
      return;
    }

    throw new Error('Expected HttpException to be thrown');
  });

  it('previews 10 addresses for a proposed on-chain configuration', async () => {
    const addresses = Array.from({ length: 10 }, (_, index) => ({
      address: `bcrt1qaddress${index}`,
      keyPath: `0/${index}`,
      index
    }));

    const getMock = jest.fn().mockResolvedValue({
      data: {
        currency: 'btc',
        addresses,
        config: {
          derivationScheme: SAMPLE_TPUB,
          accountKeyPath: "1234abcd/84'/1'/0'"
        }
      }
    });

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

    const service = buildService();

    const result = await service.previewOnchain(
      store.btcpayStoreId,
      'btc',
      {
        config: {
          derivationScheme: SAMPLE_TPUB,
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
    expect(getMock).toHaveBeenCalledTimes(1);
    const [path, options] = getMock.mock.calls[0];
    expect(path).toBe('/api/v1/stores/JDm5GuV/payment-methods/BTC-CHAIN/wallet/preview');
    expect(options).toEqual({
      params: {
        offset: '0',
        count: '10',
        derivationScheme: SAMPLE_TPUB,
        accountKeyPath: "1234abcd/84'/1'/0'"
      }
    });
    expect(options.params.masterFingerprint).toBeUndefined();
  });

  it('returns disabled presence when on-chain config is missing', async () => {
    const error = Object.assign(new Error('Not found'), {
      isAxiosError: true,
      response: { status: 404 }
    });

    mockedAxios.create.mockReturnValue(
      mockAxiosInstance({
        get: jest.fn().mockRejectedValue(error)
      })
    );

    const service = buildService();
    const result = await service.getOnchainConfig(store.btcpayStoreId, true, { store });

    expect(result).toEqual({ enabled: false });
  });

  it('normalizes on-chain metadata returned from BTCPay', async () => {
    const getMock = jest.fn().mockResolvedValue({
      data: {
        enabled: true,
        config: {
          derivationScheme: 'tpubExample',
          accountKeyPath: "m/84'/1'/0'",
          masterFingerprint: '10b3bfc0',
          label: 'Primary'
        }
      }
    });

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

    const service = buildService();
    const result = await service.getOnchainConfig(store.btcpayStoreId, true, { store });

    expect(result).toEqual({
      enabled: true,
      config: {
        derivationScheme: 'tpubExample',
        accountKeyPath: "m/84'/1'/0'",
        masterFingerprint: '10B3BFC0',
        label: 'Primary'
      }
    });
  });

  it('omits empty config objects when previewing', async () => {
    const getMock = jest.fn().mockResolvedValue({
      data: {
        currency: 'btc',
        addresses: [
          { address: 'bc1qexample0', keyPath: '0/0', index: 0 },
          { address: 'bc1qexample1', keyPath: '0/1', index: 1 }
        ]
      }
    });

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

    const service = buildService();

    await service.previewOnchain(store.btcpayStoreId, 'btc', undefined, { store });

    expect(getMock).toHaveBeenCalledTimes(1);
    const [path, options] = getMock.mock.calls[0];
    expect(path).toBe('/api/v1/stores/JDm5GuV/payment-methods/BTC-CHAIN/wallet/preview');
    expect(options).toEqual({
      params: {
        offset: '0',
        count: '10'
      }
    });
  });

  it('does not include master fingerprint in preview parameters', async () => {
    const getMock = jest.fn().mockResolvedValue({
      data: {
        currency: 'btc',
        addresses: []
      }
    });

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

    const service = buildService();

    await service.previewOnchain(
      store.btcpayStoreId,
      'btc',
      {
        config: {
          derivationScheme: SAMPLE_TPUB,
          accountKeyPath: "1234abcd/84'/1'/0'"
        }
      },
      { store }
    );

    expect(getMock).toHaveBeenCalledTimes(1);
    const [path, options] = getMock.mock.calls[0];
    expect(path).toBe('/api/v1/stores/JDm5GuV/payment-methods/BTC-CHAIN/wallet/preview');
    expect(options).toEqual({
      params: {
        offset: '0',
        count: '10',
        derivationScheme: SAMPLE_TPUB,
        accountKeyPath: "1234abcd/84'/1'/0'"
      }
    });
  });

  it('propagates BTCPay 422 payload without rewriting the message', async () => {
    const payload = 'Descriptor checksum mismatch';
    const response = {
      status: 422,
      statusText: 'Unprocessable Entity',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: payload
    } as any;
    const axiosError = new AxiosError(
      'Invalid derivation',
      'ERR_BAD_REQUEST',
      { headers: new AxiosHeaders() },
      undefined,
      response
    );
    axiosError.response = response;
    axiosError.isAxiosError = true;

    const getMock = jest.fn().mockRejectedValue(axiosError);
    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

    const service = buildService();

    expect.assertions(5);

    try {
      await service.previewOnchain(
        store.btcpayStoreId,
        'btc',
        { config: { derivationScheme: SAMPLE_TPUB } },
        { store }
      );
    } catch (error) {
      expect(getMock).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      if (!(error instanceof UnprocessableEntityException)) {
        throw error;
      }
      const httpError = error;
      expect(httpError.getStatus()).toBe(422);
      const responsePayload = httpError.getResponse();
      if (typeof responsePayload === 'string') {
        expect(responsePayload).toBe(payload);
      } else {
        expect((responsePayload as { message?: string }).message).toBe(payload);
      }
      expect(httpError.cause).toBe(axiosError);
      return;
    }

    throw new Error('Expected HttpException to be thrown');
  });

  it('proxies preview validation errors from BTCPay', async () => {
    const response = {
      status: 422,
      statusText: 'Unprocessable Entity',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: 'Invalid derivation'
    } as any;
    const axiosError = new AxiosError(
      'Invalid derivation',
      'ERR_BAD_REQUEST',
      { headers: new AxiosHeaders() },
      undefined,
      response
    );
    axiosError.response = response;
    axiosError.isAxiosError = true;

    const getMock = jest.fn().mockRejectedValue(axiosError);
    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

    const service = buildService();

    expect.assertions(5);

    try {
      await service.previewOnchainAddresses(store, { derivationScheme: SAMPLE_TPUB });
    } catch (error) {
      expect(getMock).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      if (!(error instanceof UnprocessableEntityException)) {
        throw error;
      }
      const httpError = error;
      expect(httpError.getStatus()).toBe(422);
      const responsePayload = httpError.getResponse();
      if (typeof responsePayload === 'string') {
        expect(responsePayload).toBe('Invalid derivation');
      } else {
        expect((responsePayload as { message?: string }).message).toBe('Invalid derivation');
      }
      expect(httpError.cause).toBe(axiosError);
      return;
    }

    throw new Error('Expected UnprocessableEntityException to be thrown');
  });

  it('sends masterFingerprint when updating payment method metadata', async () => {
    const putMock = jest.fn().mockResolvedValue({ data: {} });

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ put: putMock }));

    const service = buildService();

    await service.updateOnchainPaymentMethod(
      {
        storeId: store.btcpayStoreId,
        derivationScheme: SAMPLE_XPUB,
        accountKeyPath: "abcd1234/84'/0'/0'",
        masterFingerprint: 'abcd1234'
      },
      { store, apiKey: 'scoped-key' }
    );

    expect(putMock).toHaveBeenCalledTimes(1);
    const [, body] = putMock.mock.calls[0];
    expect(body).toEqual({
      enabled: true,
      config: {
        derivationScheme: SAMPLE_XPUB,
        accountKeyPath: "abcd1234/84'/0'/0'",
        masterFingerprint: 'ABCD1234',
        label: null
      }
    });
  });

  it('omits account key path and master fingerprint when descriptor already includes fingerprint', async () => {
    const putMock = jest.fn().mockResolvedValue({ data: {} });

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ put: putMock }));

    const service = buildService();

    const descriptor = "wpkh([d34db33f/84'/1'/0']tpubExample/0/*)";

    await service.updateOnchainPaymentMethod(
      {
        storeId: store.btcpayStoreId,
        derivationScheme: descriptor,
        accountKeyPath: "m/84'/1'/0'",
        masterFingerprint: 'd34db33f',
        label: 'Primary descriptor'
      },
      { store }
    );

    expect(putMock).toHaveBeenCalledWith(
      '/api/v1/stores/JDm5GuV/payment-methods/BTC-CHAIN',
      {
        enabled: true,
        config: {
          derivationScheme: descriptor,
          label: 'Primary descriptor'
        }
      }
    );
  });

  // Legacy fallback behaviour is covered by the dedicated preview test above.

  it('returns enabled flag and normalized key path after updating the on-chain method', async () => {
    const putMock = jest.fn().mockResolvedValue({
      data: {
        enabled: true,
        paymentMethodId: 'BTC-OnChain',
        currency: 'btc',
        config: {
          derivationScheme: SAMPLE_XPUB,
          accountKeySettings: [
            { accountKeyPath: "84'/0'/0'", masterFingerprint: 'abcdef12' }
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
          derivationScheme: SAMPLE_XPUB,
          accountKeyPath: "abcdef12/84'/0'/0'"
        }
      },
      { store }
    );

    expect(result.enabled).toBe(true);
    expect(result.paymentMethodId).toBe('BTC-CHAIN');
    expect(result.config.accountKeyPath).toBe("84'/0'/0'");
    expect(result.config.masterFingerprint).toBe('ABCDEF12');
    expect(result.config.derivationScheme).toBe(SAMPLE_XPUB);
    expect(putMock).toHaveBeenCalledWith(
      '/api/v1/stores/JDm5GuV/payment-methods/BTC-CHAIN',
      expect.objectContaining({
        enabled: true,
        config: expect.objectContaining({
          derivationScheme: SAMPLE_XPUB,
          accountKeyPath: "abcdef12/84'/0'/0'"
        })
      })
    );
  });

  it('retrieves on-chain status without requesting configuration payloads', async () => {
    const getMock = jest.fn().mockResolvedValue({
      data: [
        {
          paymentMethodId: 'BTC-OnChain',
          enabled: true
        }
      ]
    });

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

    const service = buildService();
    const result = await service.getOnchainMethodStatus(store.btcpayStoreId, 'BTC-OnChain', { store });

    expect(getMock).toHaveBeenCalledWith(
      '/api/v1/stores/JDm5GuV/payment-methods',
      {
        params: {
          paymentMethodId: 'BTC-CHAIN',
          onlyEnabled: false,
          includeConfig: false
        }
      }
    );
    expect(result).toEqual({
      storeId: store.btcpayStoreId,
      paymentMethodId: 'BTC-CHAIN',
      enabled: true
    });
  });

  it('treats missing on-chain methods as disabled when querying status', async () => {
    const error = {
      isAxiosError: true,
      response: { status: 404 }
    } as AxiosError;
    const getMock = jest.fn().mockRejectedValue(error);

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

    const service = buildService();
    const result = await service.getOnchainMethodStatus(store.btcpayStoreId, 'BTC-OnChain', { store });

    expect(result).toEqual({
      storeId: store.btcpayStoreId,
      paymentMethodId: 'BTC-CHAIN',
      enabled: false
    });
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
      '/api/v1/stores/JDm5GuV/payment-methods/BTC-CHAIN',
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
          derivationScheme: 'xpubError'
        },
        { store, apiKey: 'temp-key' }
      )
    ).rejects.toBeInstanceOf(BTCPayUpstreamError);
  });

  it('loads configuration when includeConfig is requested', async () => {
    const getMock = jest.fn().mockResolvedValue({
      data: {
        enabled: true,
        paymentMethodId: 'BTC-CHAIN',
        currency: 'btc',
        config: { derivationScheme: SAMPLE_XPUB }
      }
    });

    mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

    const service = buildService();

    const result = await service.getOnchain(store.btcpayStoreId, 'BTC', { store, includeConfig: true });

    expect(getMock).toHaveBeenCalled();
    expect(result.enabled).toBe(true);
    expect(result.config.derivationScheme).toBe(SAMPLE_XPUB);
  });

  it('retrieves an on-chain wallet summary with preview fallback', async () => {
    const getMock = jest
      .fn()
      .mockResolvedValueOnce({
        data: {
          paymentMethodId: 'btc-chain',
          enabled: true,
          currency: 'btc'
        }
      })
      .mockResolvedValueOnce({
        data: {
          addresses: [
            { address: 'bcrt1qa' },
            { address: 'bcrt1qb' },
            { address: '  ' }
          ]
        }
      });

    mockedAxios.create.mockReturnValue(
      mockAxiosInstance({ get: getMock })
    );

    const service = buildService();
    const result = await service.getOnchainWalletSummary(store.btcpayStoreId, store.btcpayHost, { store });

    expect(getMock).toHaveBeenNthCalledWith(1, '/api/v1/stores/JDm5GuV/payment-methods/BTC-CHAIN');
    expect(getMock).toHaveBeenNthCalledWith(2, '/api/v1/stores/JDm5GuV/payment-methods/BTC-CHAIN/wallet/preview', {
      params: { count: 10 }
    });
    expect(result).toEqual({
      storeId: store.btcpayStoreId,
      paymentMethodId: 'BTC-CHAIN',
      enabled: true,
      currency: 'BTC',
      previewAddresses: ['bcrt1qa', 'bcrt1qb']
    });
  });

  it('requires an elevated API key to fetch internal configuration', async () => {
    mockedAxios.create.mockReturnValue(
      mockAxiosInstance({
        get: jest.fn().mockResolvedValue({
          data: {
            paymentMethodId: 'BTC-CHAIN',
            enabled: true,
            config: {
              derivationScheme: 'xpub123',
              accountKeyPath: "m/84'/0'/0'",
              masterFingerprint: 'abcdef12'
            }
          }
        })
      })
    );

    const service = buildService();
    const result = await service.getOnchainWalletConfigInternal(store.btcpayStoreId, store.btcpayHost, {
      store,
      apiKeyOverride: 'override-key'
    });

    expect(result).toEqual(
      expect.objectContaining({
        storeId: store.btcpayStoreId,
        paymentMethodId: 'BTC-CHAIN',
        enabled: true,
        config: expect.objectContaining({
          derivationScheme: 'xpub123',
          accountKeyPath: "84'/0'/0'",
          masterFingerprint: 'ABCDEF12',
          label: null
        })
      })
    );
  });

  it('throws when internal configuration is requested without an override key', async () => {
    const service = buildService();

    await expect(
      service.getOnchainWalletConfigInternal(store.btcpayStoreId, store.btcpayHost, { store })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

});
