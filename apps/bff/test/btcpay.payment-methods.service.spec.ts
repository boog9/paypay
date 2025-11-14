import { BadGatewayException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance, AxiosHeaders, AxiosResponse } from 'axios';
import { Repository } from 'typeorm';
import {
  BtcpayPaymentMethodsService,
  DEFAULT_PREVIEW_ADDRESS_COUNT,
  OnchainConfigDto,
  OnchainPreviewDescriptorDto
} from '../src/btcpay/btcpay.payment-methods.service';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';
import { EnvelopeEncryptionService } from '../src/security/envelope-encryption.service';
import { BtcpayService } from '../src/btcpay/btcpay.service';

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

  beforeEach(() => {
    jest.clearAllMocks();
    (encryptionService.decrypt as jest.Mock).mockClear();
    mockedAxios.create.mockReset();
    mockedAxios.isAxiosError.mockReset?.();
    mockedAxios.isAxiosError.mockImplementation((candidate: unknown): candidate is AxiosError => {
      if (!candidate || typeof candidate !== 'object') {
        return false;
      }
      if (candidate instanceof AxiosError) {
        return true;
      }
      return Boolean((candidate as { isAxiosError?: boolean }).isAxiosError);
    });
    (repository.findOne as unknown as jest.Mock).mockResolvedValue(store);
  });

  function buildAxiosError(
    status: number,
    data: unknown,
    options: { message?: string; statusText?: string; code?: string } = {}
  ): AxiosError {
    const { message = 'Request failed', statusText = 'Error', code } = options;
    const response = {
      status,
      statusText,
      data,
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() }
    } as AxiosResponse;

    const axiosError = new AxiosError(message, code, { headers: new AxiosHeaders() }, undefined, response);
    axiosError.isAxiosError = true;
    axiosError.response = response;

    return axiosError;
  }

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

  describe('previewWithDescriptor', () => {
    it('calls BTCPay via GET with descriptor params', async () => {
      const getMock = jest.fn().mockResolvedValue({
        status: 200,
        data: { addresses: [{ address: 'tb1qexample0' }] }
      });

      mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

      const service = buildService();
      const dto: OnchainPreviewDescriptorDto = {
        derivationScheme: "wpkh([FPR/84'/1'/0']tpub.../0/*)",
        accountKeyPath: "m/84'/1'/0'"
      };

      const result = await service.previewWithDescriptor(store.id, dto, { store });

      expect(result.addresses).toEqual([{ address: 'tb1qexample0' }]);
      expect(getMock).toHaveBeenCalledWith(
        '/api/v1/stores/JDm5GuV/payment-methods/BTC-CHAIN/wallet/preview',
        {
          params: {
            offset: '0',
            count: String(DEFAULT_PREVIEW_ADDRESS_COUNT),
            derivationScheme: dto.derivationScheme,
            accountKeyPath: dto.accountKeyPath
          }
        }
      );
    });

    it('maps BTCPay validation errors to BadRequestException with descriptor context', async () => {
      const axiosError = buildAxiosError(
        422,
        { message: 'Invalid derivation strategy' },
        { message: 'Invalid', statusText: 'Unprocessable', code: 'ERR_BAD_REQUEST' }
      );

      const getMock = jest.fn().mockRejectedValue(axiosError);
      mockedAxios.create.mockReturnValue(mockAxiosInstance({ get: getMock }));

      const service = buildService();

      await expect(
        service.previewWithDescriptor(store.id, {
          derivationScheme: 'invalid',
          accountKeyPath: "m/84'/1'/0'"
        }, { store })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('previewWithTpub', () => {
    it('posts config payload for tpub preview', async () => {
      const postMock = jest.fn().mockResolvedValue({ status: 200, data: { addresses: [] } });
      mockedAxios.create.mockReturnValue(mockAxiosInstance({ post: postMock }));

      const service = buildService();
      const dto: OnchainConfigDto = {
        tpub: SAMPLE_TPUB,
        rootFingerprint: 'A1B2C3D4',
        accountKeyPath: "84'/1'/0'"
      };

      await service.previewWithTpub(store.id, dto, { store });

      expect(postMock).toHaveBeenCalledWith(
        '/api/v1/stores/JDm5GuV/payment-methods/BTC-CHAIN/wallet/preview',
        {
          config: {
            accountDerivation: SAMPLE_TPUB,
            accountOriginal: SAMPLE_TPUB,
            accountKeySettings: [
              {
                rootFingerprint: 'A1B2C3D4',
                accountKeyPath: "84'/1'/0'",
                accountKey: SAMPLE_TPUB
              }
            ],
            isHotWallet: false
          }
        },
        {
          params: {
            offset: '0',
            count: String(DEFAULT_PREVIEW_ADDRESS_COUNT)
          }
        }
      );
    });

    it('translates Missing config error into descriptive BadRequest', async () => {
      const axiosError = buildAxiosError(
        422,
        { message: 'Missing config' },
        { message: 'Missing config', statusText: 'Unprocessable', code: 'ERR_BAD_REQUEST' }
      );

      const postMock = jest.fn().mockRejectedValue(axiosError);
      mockedAxios.create.mockReturnValue(mockAxiosInstance({ post: postMock }));

      const service = buildService();

      await expect(
        service.previewWithTpub(
          store.id,
          { tpub: SAMPLE_TPUB, rootFingerprint: 'A1B2C3D4', accountKeyPath: "84'/1'/0'" },
          { store }
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('prefers provided store context for API key and base URL', async () => {
      const postMock = jest.fn().mockResolvedValue({ status: 200, data: { addresses: [] } });
      mockedAxios.create.mockReturnValue(mockAxiosInstance({ post: postMock }));
      const service = buildService();
      const customStore: ManagedStoreEntity = {
        ...store,
        btcpayHost: 'https://tenant-btcpay.example'
      } as ManagedStoreEntity;

      await service.previewWithTpub(
        'fallback-id',
        { tpub: SAMPLE_TPUB, rootFingerprint: 'A1B2C3D4', accountKeyPath: "84'/1'/0'" },
        { store: customStore }
      );

      expect(repository.findOne).not.toHaveBeenCalled();
      expect(encryptionService.decrypt).toHaveBeenCalledWith(
        customStore.apiKeyCiphertext,
        customStore.apiKeyDekWrapped
      );
      expect(btcpayService.resolveBaseUrl).toHaveBeenCalledWith('https://tenant-btcpay.example');
    });
  });

  describe('saveOnchain', () => {
    it('persists config with enabled flag defaulting to true', async () => {
      const putMock = jest.fn().mockResolvedValue({ status: 200, data: { ok: true } });
      mockedAxios.create.mockReturnValue(mockAxiosInstance({ put: putMock }));

      const service = buildService();

      await service.saveOnchain(
        store.id,
        { tpub: SAMPLE_TPUB, rootFingerprint: 'A1B2C3D4', accountKeyPath: "84'/1'/0'" },
        { store }
      );

      expect(putMock).toHaveBeenCalledWith(
        '/api/v1/stores/JDm5GuV/payment-methods/BTC-CHAIN',
        {
          config: {
            accountDerivation: SAMPLE_TPUB,
            accountOriginal: SAMPLE_TPUB,
            accountKeySettings: [
              {
                rootFingerprint: 'A1B2C3D4',
                accountKeyPath: "84'/1'/0'",
                accountKey: SAMPLE_TPUB
              }
            ],
            isHotWallet: false
          },
          enabled: true
        }
      );
    });

    it('allows overriding enabled flag (used for disable)', async () => {
      const putMock = jest.fn().mockResolvedValue({ status: 200, data: {} });
      mockedAxios.create.mockReturnValue(mockAxiosInstance({ put: putMock }));

      const service = buildService();

      await service.saveOnchain(
        store.id,
        { tpub: SAMPLE_TPUB, rootFingerprint: 'A1B2C3D4', accountKeyPath: "84'/1'/0'" },
        { store, enabled: false }
      );

      expect(putMock).toHaveBeenCalledWith(
        '/api/v1/stores/JDm5GuV/payment-methods/BTC-CHAIN',
        expect.objectContaining({ enabled: false })
      );
    });

    it('maps BTCPay auth failure to UnauthorizedException', async () => {
      const axiosError = buildAxiosError(401, 'Unauthorized', {
        message: 'Unauthorized',
        statusText: 'Unauthorized',
        code: 'ERR_BAD_REQUEST'
      });
      const putMock = jest.fn().mockRejectedValue(axiosError);
      mockedAxios.create.mockReturnValue(mockAxiosInstance({ put: putMock }));

      const service = buildService();

      await expect(
        service.saveOnchain(
          store.id,
          { tpub: SAMPLE_TPUB, rootFingerprint: 'A1B2C3D4', accountKeyPath: "84'/1'/0'" },
          { store }
        )
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('translates BTCPay upstream errors to BadRequestException when validation fails', async () => {
      const axiosError = buildAxiosError(
        422,
        { message: 'Invalid AccountKeySettings' },
        { message: 'Invalid AccountKeySettings', statusText: 'Unprocessable', code: 'ERR_BAD_REQUEST' }
      );
      const putMock = jest.fn().mockRejectedValue(axiosError);
      mockedAxios.create.mockReturnValue(mockAxiosInstance({ put: putMock }));

      const service = buildService();

      await expect(
        service.saveOnchain(
          store.id,
          { tpub: SAMPLE_TPUB, rootFingerprint: 'A1B2C3D4', accountKeyPath: "84'/1'/0'" },
          { store }
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('propagates BTCPay auth failures during preview as UnauthorizedException', async () => {
    const axiosError = buildAxiosError(401, 'Unauthorized', {
      message: 'Unauthorized',
      statusText: 'Unauthorized',
      code: 'ERR_BAD_REQUEST'
    });
    const postMock = jest.fn().mockRejectedValue(axiosError);
    mockedAxios.create.mockReturnValue(mockAxiosInstance({ post: postMock }));

    const service = buildService();

    await expect(
      service.previewWithTpub(
        store.id,
        { tpub: SAMPLE_TPUB, rootFingerprint: 'A1B2C3D4', accountKeyPath: "84'/1'/0'" },
        { store }
      )
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('handles upstream BTCPay failures as BadGateway when previewing', async () => {
    const axiosError = new AxiosError(
      'Upstream error',
      'ERR_BAD_REQUEST',
      { headers: new AxiosHeaders() },
      undefined,
      {
        status: 502,
        statusText: 'Bad Gateway',
        data: 'Bad Gateway',
        headers: new AxiosHeaders(),
        config: { headers: new AxiosHeaders() }
      }
    );
    (axiosError as AxiosError).isAxiosError = true;

    const postMock = jest.fn().mockRejectedValue(axiosError);
    mockedAxios.create.mockReturnValue(mockAxiosInstance({ post: postMock }));

    const service = buildService();

    await expect(
      service.previewWithTpub(
        store.id,
        { tpub: SAMPLE_TPUB, rootFingerprint: 'A1B2C3D4', accountKeyPath: "84'/1'/0'" },
        { store }
      )
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
