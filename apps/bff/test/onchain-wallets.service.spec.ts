import {
  BadGatewayException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { OnchainWalletSummaryReadModel, OnchainWalletsService } from '../src/wallets/onchain-wallets.service';
import { ManagedStoreWalletEntity } from '../src/wallets/entities/managed-store-wallet.entity';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';
import { BtcpayPaymentMethodsService, OnchainPreviewResponse } from '../src/btcpay/btcpay.payment-methods.service';
import { BtcpayKeysService } from '../src/btcpay/btcpay.keys.service';
import { BTCPayAuthError, BTCPayUpstreamError } from '../src/btcpay/btcpay.errors';

const store: ManagedStoreEntity = {
  id: 'local-store',
  userId: 'tenant-user',
  btcpayStoreId: 'store-789',
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
  updatedAt: new Date(),
} as ManagedStoreEntity;

describe('OnchainWalletsService', () => {
  const repository = {
    findOne: jest.fn().mockResolvedValue(store),
  } as unknown as Repository<ManagedStoreEntity>;

  const walletRepository = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((value) => value),
    save: jest.fn().mockImplementation(async (value) => value),
  } as unknown as Repository<ManagedStoreWalletEntity>;

  const previewResponse: OnchainPreviewResponse = {
    storeId: store.btcpayStoreId,
    currency: 'BTC',
    paymentMethodId: 'BTC-OnChain',
    addresses: Array.from({ length: 10 }, (_, index) => ({
      address: `bcrt1qpreview${index}`,
      keyPath: `0/${index}`,
      index,
    })),
  };

  const SAMPLE_XPUB =
    "xpub6DQr6ATUNo26pU5ViMmd5eLYCoqUhZMN52JhppqmjdBng2mMPmGhBX4F1p7nyTLMEScjUC2hRuME3Pw9WvctsVkb3tUSVs9HmLxxdKqKwHx";
  const SAMPLE_ZPUB = `zpub${SAMPLE_XPUB.slice(4)}`;
  const SAMPLE_DESCRIPTOR =
    "wpkh([abcd1234/84'/0'/0']xpub6DQr6ATUNo26pU5ViMmd5eLYCoqUhZMN52JhppqmjdBng2mMPmGhBX4F1p7nyTLMEScjUC2hRuME3Pw9WvctsVkb3tUSVs9HmLxxdKqKwHx/0/*)";

  const paymentMethods = {
    previewOnchain: jest.fn().mockResolvedValue(previewResponse),
    previewOnchainPaymentMethod: jest.fn().mockResolvedValue(previewResponse),
    updateOnchainPaymentMethod: jest.fn(),
    getOnchainWalletSummary: jest.fn().mockResolvedValue({
      storeId: store.btcpayStoreId,
      paymentMethodId: 'BTC-CHAIN',
      enabled: true,
      currency: 'BTC',
      previewAddresses: ['bcrt1qpreview0', 'bcrt1qpreview1']
    })
  } as unknown as BtcpayPaymentMethodsService;

  const keysService = {
    withStoreSettingsReadKey: jest.fn(),
    withStoreSettingsWriteKey: jest.fn()
  } as unknown as BtcpayKeysService;

  const service = new OnchainWalletsService(
    repository,
    walletRepository,
    paymentMethods,
    keysService
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (repository.findOne as jest.Mock).mockResolvedValue(store);
    (walletRepository.findOne as jest.Mock).mockResolvedValue(null);
    (paymentMethods.previewOnchain as jest.Mock).mockResolvedValue(previewResponse);
    (paymentMethods.previewOnchainPaymentMethod as jest.Mock).mockResolvedValue(previewResponse);
    (paymentMethods.getOnchainWalletSummary as jest.Mock).mockResolvedValue({
      storeId: store.btcpayStoreId,
      paymentMethodId: 'BTC-CHAIN',
      enabled: true,
      currency: 'BTC',
      previewAddresses: ['bcrt1qpreview0']
    });
    (keysService.withStoreSettingsReadKey as jest.Mock).mockReset();
    (keysService.withStoreSettingsWriteKey as jest.Mock).mockReset();
    (paymentMethods.updateOnchainPaymentMethod as jest.Mock).mockReset();
    (paymentMethods.updateOnchainPaymentMethod as jest.Mock).mockResolvedValue(undefined);
    (walletRepository.create as jest.Mock).mockImplementation((value) => value);
    (walletRepository.save as jest.Mock).mockImplementation(async (value) => value);
  });

  it('limits preview addresses to the requested amount', async () => {
    (keysService.withStoreSettingsReadKey as jest.Mock).mockImplementation(
      async (_storeId: string, _email: string, handler: (apiKey: string) => Promise<unknown>) => {
        return handler('temp-preview-key');
      }
    );

    const result = await service.preview({ id: 'tenant-user', email: 'merchant@example.com' }, store.btcpayStoreId, {
      derivationScheme: SAMPLE_ZPUB,
      amount: 5,
    } as any);

    expect(keysService.withStoreSettingsReadKey).toHaveBeenCalledWith(
      store.btcpayStoreId,
      'merchant@example.com',
      expect.any(Function),
      { host: store.btcpayHost }
    );
    expect(paymentMethods.previewOnchainPaymentMethod).toHaveBeenCalledWith(
      store.btcpayStoreId,
      'BTC',
      {
        derivationScheme: SAMPLE_ZPUB,
        accountKeyPath: null,
      },
      { store, apiKeyOverride: 'temp-preview-key' }
    );
    expect(result.currency).toBe('BTC');
    expect(result.paymentMethodId).toBe('BTC-CHAIN');
    expect(result.addresses).toHaveLength(5);
    expect(result.addresses[0]?.address).toBe('bcrt1qpreview0');
    expect(result.addresses[4]?.index).toBe(4);
  });

  it('attempts preview with elevated scope when read permissions are insufficient', async () => {
    (keysService.withStoreSettingsReadKey as jest.Mock).mockImplementation(
      async (_storeId: string, _email: string, handler: (apiKey: string) => Promise<unknown>) =>
        handler('preview-read')
    );
    (keysService.withStoreSettingsWriteKey as jest.Mock).mockImplementation(
      async (_storeId: string, _email: string, handler: (apiKey: string) => Promise<unknown>) =>
        handler('preview-write')
    );
    (paymentMethods.previewOnchainPaymentMethod as jest.Mock)
      .mockRejectedValueOnce(new ForbiddenException('BTCPay returned limited permissions'))
      .mockResolvedValueOnce(previewResponse);

    const result = await service.preview(
      { id: 'tenant-user', email: 'merchant@example.com' },
      store.btcpayStoreId,
      { derivationScheme: SAMPLE_ZPUB } as any
    );

    expect(keysService.withStoreSettingsReadKey).toHaveBeenCalledTimes(1);
    expect(keysService.withStoreSettingsWriteKey).toHaveBeenCalledTimes(1);
    expect(paymentMethods.previewOnchainPaymentMethod).toHaveBeenCalledTimes(2);
    expect(result.addresses).toEqual(previewResponse.addresses);
  });

  it('updates the on-chain payment method using a temporary key', async () => {
    (keysService.withStoreSettingsWriteKey as jest.Mock).mockImplementation(
      async (_storeId: string, _email: string, handler: (apiKey: string) => Promise<unknown>) => {
        await handler('temp-key');
      }
    );

    await service.update(
      { id: 'tenant-user', email: 'merchant@example.com' },
      store.btcpayStoreId,
      {
        derivationScheme: SAMPLE_XPUB,
        accountKeyPath: "m/84'/0'/0'",
        masterFingerprint: 'abcdef12'
      } as any
    );

    expect(keysService.withStoreSettingsWriteKey).toHaveBeenCalledWith(
      store.btcpayStoreId,
      'merchant@example.com',
      expect.any(Function),
      { host: store.btcpayHost }
    );

    expect(paymentMethods.updateOnchainPaymentMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: store.btcpayStoreId,
        cryptoCode: 'BTC',
        derivationScheme: SAMPLE_XPUB,
        masterFingerprint: 'abcdef12'
      }),
      { store, apiKey: 'temp-key' }
    );

    expect(walletRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethodId: 'BTC-CHAIN',
        derivationScheme: 'PRESENT',
        accountKeyPath: "m/84'/0'/0'",
        masterFingerprint: 'ABCDEF12',
        label: null
      })
    );
  });

  it('accepts rootFingerprint alias when updating the on-chain payment method', async () => {
    (keysService.withStoreSettingsWriteKey as jest.Mock).mockImplementation(
      async (_storeId: string, _email: string, handler: (apiKey: string) => Promise<unknown>) => {
        await handler('temp-key');
      }
    );

    await service.update(
      { id: 'tenant-user', email: 'merchant@example.com' },
      store.btcpayStoreId,
      {
        derivationScheme: SAMPLE_XPUB,
        accountKeyPath: "m/84'/0'/0'",
        rootFingerprint: 'abcdef12'
      } as any
    );

    expect(paymentMethods.updateOnchainPaymentMethod).toHaveBeenCalledWith(
      expect.objectContaining({ masterFingerprint: 'abcdef12' }),
      expect.any(Object)
    );
  });

  it('returns 422 with the upstream validation message when BTCPay rejects the update', async () => {
    (keysService.withStoreSettingsWriteKey as jest.Mock).mockImplementation(
      async (_storeId: string, _email: string, handler: (apiKey: string) => Promise<unknown>) => {
        await handler('temp-key');
      }
    );

    (paymentMethods.updateOnchainPaymentMethod as jest.Mock).mockRejectedValue(
      new BTCPayUpstreamError('Invalid derivation scheme', undefined, 422)
    );

    expect.assertions(3);

    try {
      await service.update(
        { id: 'tenant-user', email: 'merchant@example.com' },
        store.btcpayStoreId,
        {
          derivationScheme: SAMPLE_XPUB,
          accountKeyPath: "m/84'/0'/0'",
          masterFingerprint: 'abcdef12'
        } as any
      );
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getStatus()).toBe(422);
      const response = (error as UnprocessableEntityException).getResponse();
      const message = typeof response === 'string' ? response : (response as { message?: string })?.message;
      expect(message).toBe('Invalid derivation scheme');
      return;
    }

    throw new Error('Expected UnprocessableEntityException');
  });

  it('throws UnauthorizedException when BTCPay rejects the temporary key', async () => {
    (keysService.withStoreSettingsWriteKey as jest.Mock).mockRejectedValue(new BTCPayAuthError());

    await expect(
      service.update(
        { id: 'tenant-user', email: 'merchant@example.com' },
        store.btcpayStoreId,
        {
          derivationScheme: SAMPLE_XPUB,
          accountKeyPath: "m/84'/0'/0'"
        } as any
      )
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(paymentMethods.updateOnchainPaymentMethod).not.toHaveBeenCalled();
  });

  it('maps upstream BTCPay errors to BadGatewayException', async () => {
    (keysService.withStoreSettingsWriteKey as jest.Mock).mockRejectedValue(new BTCPayUpstreamError());

    await expect(
      service.update(
        { id: 'tenant-user', email: 'merchant@example.com' },
        store.btcpayStoreId,
        {
          derivationScheme: SAMPLE_XPUB,
          accountKeyPath: "m/84'/0'/0'"
        } as any
      )
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(paymentMethods.updateOnchainPaymentMethod).not.toHaveBeenCalled();
  });


  describe('getSummary', () => {
    it('returns a sanitized summary with preview addresses', async () => {
      (paymentMethods.getOnchainWalletSummary as jest.Mock).mockResolvedValueOnce({
        storeId: store.btcpayStoreId,
        paymentMethodId: 'btc-chain',
        enabled: true,
        currency: 'btc',
        previewAddresses: ['bcrt1qa', 'bcrt1qb']
      });

      const result = await service.getSummary(
        { id: 'tenant-user', email: 'merchant@example.com' },
        store.btcpayStoreId
      );

      expect(paymentMethods.getOnchainWalletSummary).toHaveBeenCalledWith(
        store.btcpayStoreId,
        store.btcpayHost,
        { store }
      );
      const expected: OnchainWalletSummaryReadModel = {
        storeId: store.btcpayStoreId,
        paymentMethodId: 'BTC-CHAIN',
        enabled: true,
        currency: 'BTC',
        previewAddresses: ['bcrt1qa', 'bcrt1qb']
      };
      expect(result).toEqual(expected);
    });

    it('throws NotFoundException when the payment method is disabled', async () => {
      (paymentMethods.getOnchainWalletSummary as jest.Mock).mockResolvedValueOnce({
        storeId: store.btcpayStoreId,
        paymentMethodId: 'BTC-CHAIN',
        enabled: false,
        currency: 'BTC',
        previewAddresses: []
      });

      await expect(
        service.getSummary({ id: 'tenant-user', email: 'merchant@example.com' }, store.btcpayStoreId)
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps BTCPay authentication failures to UnauthorizedException', async () => {
      (paymentMethods.getOnchainWalletSummary as jest.Mock).mockRejectedValueOnce(new BTCPayAuthError());

      await expect(
        service.getSummary({ id: 'tenant-user', email: 'merchant@example.com' }, store.btcpayStoreId)
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('maps BTCPay upstream 403 errors to ForbiddenException', async () => {
      (paymentMethods.getOnchainWalletSummary as jest.Mock).mockRejectedValueOnce(
        new BTCPayUpstreamError('Forbidden', undefined, 403)
      );

      await expect(
        service.getSummary({ id: 'tenant-user', email: 'merchant@example.com' }, store.btcpayStoreId)
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('maps BTCPay upstream 404 errors to NotFoundException', async () => {
      (paymentMethods.getOnchainWalletSummary as jest.Mock).mockRejectedValueOnce(
        new BTCPayUpstreamError('Missing', undefined, 404)
      );

      await expect(
        service.getSummary({ id: 'tenant-user', email: 'merchant@example.com' }, store.btcpayStoreId)
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

});
