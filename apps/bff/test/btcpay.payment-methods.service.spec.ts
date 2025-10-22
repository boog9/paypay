import axios from 'axios';
import type { AxiosInstance } from 'axios';
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
  });

  function buildService(): BtcpayPaymentMethodsService {
    return new BtcpayPaymentMethodsService(repository, encryptionService, btcpayService);
  }

  it('previews 10 addresses for a proposed on-chain configuration', async () => {
    const postMock = jest.fn().mockResolvedValue({
      data: {
        addresses: Array.from({ length: 10 }, (_, index) => ({
          address: `bcrt1qaddress${index}`,
          keyPath: `0/${index}`,
          index
        }))
      }
    });

    mockedAxios.create.mockReturnValue({
      post: postMock,
      get: jest.fn(),
      put: jest.fn()
    } as unknown as AxiosInstance);

    const service = buildService();

    const result = await service.previewOnchain(store.btcpayStoreId, 'BTC', {
      derivationScheme: 'tpubDexample',
      accountKeyPath: "1234abcd/84'/1'/0'"
    }, { store });

    expect(result.addresses).toHaveLength(10);
    expect(result.addresses[0]).toMatchObject({ address: 'bcrt1qaddress0', keyPath: '0/0' });
    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://btcpay.example',
        headers: expect.objectContaining({ Authorization: 'token store-api-key' })
      })
    );
    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/stores/store-123/payment-methods/BTC-CHAIN/wallet/preview',
      expect.objectContaining({ config: expect.objectContaining({ derivationScheme: 'tpubDexample' }) }),
      expect.objectContaining({ params: { offset: '0', amount: '10' } })
    );
  });

  it('returns enabled flag and normalized key path after updating the on-chain method', async () => {
    const putMock = jest.fn().mockResolvedValue({
      data: {
        enabled: true,
        paymentMethodId: 'BTC-CHAIN',
        config: {
          derivationScheme: 'xpub6Example',
          accountKeySettings: [
            { accountKeyPath: "84'/0'/0'", rootFingerprint: 'abcdef12' }
          ]
        }
      }
    });

    mockedAxios.create.mockReturnValue({
      post: jest.fn(),
      get: jest.fn(),
      put: putMock
    } as unknown as AxiosInstance);

    const service = buildService();

    const result = await service.updateOnchain(store.btcpayStoreId, 'BTC', {
      enabled: true,
      derivationScheme: 'xpub6Example',
      accountKeyPath: "abcdef12/84'/0'/0'"
    }, { store });

    expect(result.enabled).toBe(true);
    expect(result.accountKeyPath).toBe("84'/0'/0'");
    expect(result.masterFingerprint).toBe('abcdef12');
    expect(putMock).toHaveBeenCalledWith(
      '/api/v1/stores/store-123/payment-methods/BTC-CHAIN',
      expect.objectContaining({
        enabled: true,
        config: expect.objectContaining({ derivationScheme: 'xpub6Example', accountKeyPath: "abcdef12/84'/0'/0'" })
      })
    );
  });
});
