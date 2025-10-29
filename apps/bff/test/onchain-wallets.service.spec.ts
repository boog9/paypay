import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException
} from '@nestjs/common';
import type { OnchainPreviewResponse, OnchainPaymentMethodConfig } from '../src/btcpay/btcpay.payment-methods.service';
import { BtcpayKeysService } from '../src/btcpay/btcpay.keys.service';
import { BtcpayPaymentMethodsService } from '../src/btcpay/btcpay.payment-methods.service';
import { BTCPayAuthError, BTCPayUpstreamError } from '../src/btcpay/btcpay.errors';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';
import { ManagedStoreWalletEntity } from '../src/wallets/entities/managed-store-wallet.entity';
import { OnchainWalletsService } from '../src/wallets/onchain-wallets.service';

const SAMPLE_ZPUB =
  "zpub6uMwVRSvPzF7nJnxv1FgGw9sLrRu6w7LCzTu8ndHgCpbxjb7Rkg6ZJqseMSW4JQkKTL2d8U4z8VmHHPT6kJj1ZqT4LwymkC5fP6C8zY4j9T";

const store: ManagedStoreEntity = {
  id: 'local-store',
  userId: 'tenant-user',
  btcpayStoreId: 'store-789',
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

const previewResponse: OnchainPreviewResponse = {
  storeId: store.btcpayStoreId,
  paymentMethodId: 'BTC-CHAIN',
  currency: 'BTC',
  addresses: Array.from({ length: 5 }, (_, index) => ({
    address: `bcrt1qpreview${index}`,
    keyPath: `0/${index}`,
    index
  }))
};

const fullConfig: OnchainPaymentMethodConfig = {
  storeId: store.btcpayStoreId,
  paymentMethodId: 'BTC-CHAIN',
  currency: 'BTC',
  enabled: true,
  config: {
    derivationScheme: `wpkh([abcdef12/84'/0'/0']${SAMPLE_ZPUB}/0/*)`,
    accountKeyPath: "m/84'/0'/0'",
    masterFingerprint: 'abcdef12',
    label: 'Primary wallet'
  }
};

describe('OnchainWalletsService', () => {
  const storesRepository = {
    findOne: jest.fn()
  };

  const walletsRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn()
  };

  const paymentMethods = {
    previewOnchainPaymentMethod: jest.fn(),
    updateOnchainPaymentMethod: jest.fn(),
    getOnchain: jest.fn()
  } as jest.Mocked<
    Pick<BtcpayPaymentMethodsService, 'previewOnchainPaymentMethod' | 'updateOnchainPaymentMethod' | 'getOnchain'>
  >;

  const keysService = {
    withStoreSettingsReadKey: jest.fn(),
    withStoreSettingsWriteKey: jest.fn()
  } as jest.Mocked<Pick<BtcpayKeysService, 'withStoreSettingsReadKey' | 'withStoreSettingsWriteKey'>>;

  const service = new OnchainWalletsService(
    storesRepository as any,
    walletsRepository as any,
    paymentMethods as any,
    keysService as any
  );

  beforeEach(() => {
    jest.clearAllMocks();
    storesRepository.findOne.mockResolvedValue(store);
    walletsRepository.findOne.mockResolvedValue(null);
    walletsRepository.create.mockImplementation((value) => value);
    walletsRepository.save.mockImplementation(async (value) => value);
    paymentMethods.previewOnchainPaymentMethod.mockResolvedValue(previewResponse);
    paymentMethods.updateOnchainPaymentMethod.mockResolvedValue(undefined);
    paymentMethods.getOnchain.mockResolvedValue(fullConfig);
    keysService.withStoreSettingsReadKey.mockImplementation(
      async (_storeId: string, _email: string, handler: (apiKey: string) => Promise<unknown>) =>
        handler('read-key')
    );
    keysService.withStoreSettingsWriteKey.mockImplementation(
      async (_storeId: string, _email: string, handler: (apiKey: string) => Promise<unknown>) =>
        handler('write-key')
    );
  });

  describe('preview', () => {
    it('limits preview addresses and requests using a read key', async () => {
      const result = await service.preview(
        { id: 'tenant-user', email: 'merchant@example.com' },
        store.btcpayStoreId,
        { derivationScheme: SAMPLE_ZPUB, amount: 2 } as any
      );

      expect(keysService.withStoreSettingsReadKey).toHaveBeenCalledWith(
        store.btcpayStoreId,
        'merchant@example.com',
        expect.any(Function),
        { host: store.btcpayHost }
      );
      expect(paymentMethods.previewOnchainPaymentMethod).toHaveBeenCalledWith(
        store.btcpayStoreId,
        'BTC',
        { derivationScheme: SAMPLE_ZPUB, accountKeyPath: null },
        { store, apiKeyOverride: 'read-key' }
      );
      expect(result.addresses).toHaveLength(2);
      expect(result.addresses[0]?.address).toBe('bcrt1qpreview0');
      expect(result.paymentMethodId).toBe('BTC-CHAIN');
    });

    it('falls back to a write key when read permissions are insufficient', async () => {
      paymentMethods.previewOnchainPaymentMethod
        .mockRejectedValueOnce(new ForbiddenException('limited'))
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
  });

  describe('getSummary', () => {
    it('returns full configuration details when accessible', async () => {
      walletsRepository.findOne.mockResolvedValue({
        paymentMethodId: 'BTC-CHAIN',
        derivationScheme: 'PRESENT',
        accountKeyPath: "m/84'/0'/0'",
        masterFingerprint: 'ABCDEF12',
        label: 'Portal metadata'
      } as Partial<ManagedStoreWalletEntity>);

      const summary = await service.getSummary(
        { id: 'tenant-user', email: 'merchant@example.com' },
        store.btcpayStoreId
      );

      expect(keysService.withStoreSettingsWriteKey).toHaveBeenCalledWith(
        store.btcpayStoreId,
        'merchant@example.com',
        expect.any(Function),
        { host: store.btcpayHost }
      );

      expect(summary).toEqual({
        hasWallet: true,
        enabled: true,
        derivationScheme: fullConfig.config.derivationScheme,
        accountKey: SAMPLE_ZPUB,
        masterFingerprint: 'ABCDEF12',
        accountKeyPath: "m/84'/0'/0'",
        label: 'Primary wallet'
      });
    });

    it('returns limited summary when BTCPay restricts configuration access', async () => {
      walletsRepository.findOne.mockResolvedValue({
        paymentMethodId: 'BTC-CHAIN',
        derivationScheme: 'PRESENT',
        accountKeyPath: null,
        masterFingerprint: null,
        label: null
      } as Partial<ManagedStoreWalletEntity>);

      paymentMethods.getOnchain.mockImplementation(async (
        _storeId: string,
        _crypto?: string,
        options?: { includeConfig?: boolean }
      ) => {
        if (options?.includeConfig) {
          throw new ForbiddenException('limited');
        }
        return {
          ...fullConfig,
          config: { derivationScheme: null, accountKeyPath: null, masterFingerprint: null, label: null }
        } satisfies OnchainPaymentMethodConfig;
      });

      const summary = await service.getSummary(
        { id: 'tenant-user', email: 'merchant@example.com' },
        store.btcpayStoreId
      );

      expect(keysService.withStoreSettingsWriteKey).toHaveBeenCalledTimes(1);
      expect(keysService.withStoreSettingsReadKey).toHaveBeenCalledTimes(1);
      expect(summary).toEqual({
        hasWallet: true,
        enabled: true,
        derivationScheme: null,
        accountKey: null,
        masterFingerprint: null,
        accountKeyPath: null,
        label: null
      });
    });

    it('propagates Unauthorized errors from BTCPay', async () => {
      paymentMethods.getOnchain.mockRejectedValue(new BTCPayAuthError());

      await expect(
        service.getSummary({ id: 'tenant-user', email: 'merchant@example.com' }, store.btcpayStoreId)
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('getPresence', () => {
    it('returns presence derived from full configuration', async () => {
      const presence = await service.getPresence(
        { id: 'tenant-user', email: 'merchant@example.com' },
        store.btcpayStoreId
      );

      expect(presence).toEqual({
        hasWallet: true,
        enabled: true,
        derivationScheme: fullConfig.config.derivationScheme
      });
      expect(keysService.withStoreSettingsWriteKey).toHaveBeenCalledTimes(1);
      expect(keysService.withStoreSettingsReadKey).not.toHaveBeenCalled();
    });

    it('uses metadata fallback when only limited access is available', async () => {
      walletsRepository.findOne.mockResolvedValue({
        paymentMethodId: 'BTC-CHAIN',
        derivationScheme: 'PRESENT',
        accountKeyPath: null,
        masterFingerprint: null,
        label: null
      } as Partial<ManagedStoreWalletEntity>);

      paymentMethods.getOnchain.mockImplementation(async (
        _storeId: string,
        _crypto?: string,
        options?: { includeConfig?: boolean }
      ) => {
        if (options?.includeConfig) {
          throw new ForbiddenException('limited');
        }
        return {
          ...fullConfig,
          enabled: true,
          config: { derivationScheme: null, accountKeyPath: null, masterFingerprint: null, label: null }
        } satisfies OnchainPaymentMethodConfig;
      });

      const presence = await service.getPresence(
        { id: 'tenant-user', email: 'merchant@example.com' },
        store.btcpayStoreId
      );

      expect(keysService.withStoreSettingsWriteKey).toHaveBeenCalledTimes(1);
      expect(keysService.withStoreSettingsReadKey).toHaveBeenCalledTimes(1);
      expect(presence).toEqual({ hasWallet: true, enabled: true, derivationScheme: null });
    });

    it('returns absence when BTCPay reports no wallet', async () => {
      paymentMethods.getOnchain.mockResolvedValue({
        ...fullConfig,
        enabled: false,
        config: { derivationScheme: null, accountKeyPath: null, masterFingerprint: null, label: null }
      });

      const presence = await service.getPresence(
        { id: 'tenant-user', email: 'merchant@example.com' },
        store.btcpayStoreId
      );

      expect(presence).toEqual({ hasWallet: false, enabled: false, derivationScheme: null });
    });
  });

  describe('update', () => {
    it('updates BTCPay and stores sanitized metadata', async () => {
      await service.update(
        { id: 'tenant-user', email: 'merchant@example.com' },
        store.btcpayStoreId,
        {
          derivationScheme: fullConfig.config.derivationScheme,
          accountKeyPath: "  m/84'/0'/0'  ",
          masterFingerprint: 'abcdef12',
          label: 'Primary wallet'
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
          derivationScheme: fullConfig.config.derivationScheme,
          accountKeyPath: "m/84'/0'/0'",
          masterFingerprint: 'abcdef12'
        }),
        { store, apiKey: 'write-key' }
      );
      expect(walletsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethodId: 'BTC-CHAIN',
          derivationScheme: 'PRESENT',
          accountKeyPath: "m/84'/0'/0'",
          masterFingerprint: 'ABCDEF12',
          label: 'Primary wallet'
        })
      );
    });

    it('throws 422 when BTCPay validation fails', async () => {
      paymentMethods.updateOnchainPaymentMethod.mockRejectedValue(
        new BTCPayUpstreamError('Invalid derivation', undefined, 422)
      );

      await expect(
        service.update(
          { id: 'tenant-user', email: 'merchant@example.com' },
          store.btcpayStoreId,
          {
            derivationScheme: fullConfig.config.derivationScheme,
            accountKeyPath: "m/84'/0'/0'",
            masterFingerprint: 'abcdef12'
          } as any
        )
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('maps BTCPay auth failures to UnauthorizedException', async () => {
      keysService.withStoreSettingsWriteKey.mockRejectedValue(new BTCPayAuthError());

      await expect(
        service.update(
          { id: 'tenant-user', email: 'merchant@example.com' },
          store.btcpayStoreId,
          {
            derivationScheme: fullConfig.config.derivationScheme,
            accountKeyPath: "m/84'/0'/0'"
          } as any
        )
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  it('throws when the store is not found for the user', async () => {
    storesRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.getPresence({ id: 'tenant-user', email: 'merchant@example.com' }, 'missing-store')
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
