import {
  BadGatewayException,
  ForbiddenException,
  UnauthorizedException,
  UnprocessableEntityException
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { OnchainWalletStatusReadModel, OnchainWalletsService } from '../src/wallets/onchain-wallets.service';
import { ManagedStoreWalletEntity } from '../src/wallets/entities/managed-store-wallet.entity';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';
import {
  BtcpayPaymentMethodsService,
  OnchainPaymentMethodConfig,
  OnchainPreviewResponse
} from '../src/btcpay/btcpay.payment-methods.service';
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

  const paymentMethods = {
    previewOnchain: jest.fn().mockResolvedValue(previewResponse),
    updateOnchainPaymentMethod: jest.fn(),
    getOnchainMethodStatus: jest.fn().mockResolvedValue({
      storeId: store.btcpayStoreId,
      paymentMethodId: 'BTC-OnChain',
      enabled: true,
    }),
    getOnchain: jest.fn().mockResolvedValue({
      storeId: store.btcpayStoreId,
      currency: 'BTC',
      paymentMethodId: 'BTC-OnChain',
      enabled: true,
      config: {
        derivationScheme: 'xpubExample',
        accountKeyPath: "m/84'/0'/0'",
        masterFingerprint: 'abcdef12',
        label: 'Desk wallet'
      }
    } as OnchainPaymentMethodConfig)
  } as unknown as BtcpayPaymentMethodsService;

  const keysService = {
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
    (paymentMethods.getOnchainMethodStatus as jest.Mock).mockResolvedValue({
      storeId: store.btcpayStoreId,
      paymentMethodId: 'BTC-OnChain',
      enabled: true,
    });
    (paymentMethods.getOnchain as jest.Mock).mockResolvedValue({
      storeId: store.btcpayStoreId,
      currency: 'BTC',
      paymentMethodId: 'BTC-OnChain',
      enabled: true,
      config: {
        derivationScheme: 'xpubExample',
        accountKeyPath: "m/84'/0'/0'",
        masterFingerprint: 'abcdef12',
        label: 'Desk wallet'
      }
    } as OnchainPaymentMethodConfig);
    (keysService.withStoreSettingsWriteKey as jest.Mock).mockReset();
    (paymentMethods.updateOnchainPaymentMethod as jest.Mock).mockReset();
    (paymentMethods.updateOnchainPaymentMethod as jest.Mock).mockResolvedValue(undefined);
    (walletRepository.create as jest.Mock).mockImplementation((value) => value);
    (walletRepository.save as jest.Mock).mockImplementation(async (value) => value);
  });

  it('limits preview addresses to the requested amount', async () => {
    const result = await service.preview({ id: 'tenant-user', email: 'merchant@example.com' }, store.btcpayStoreId, {
      derivationScheme: 'zpubExample',
      amount: 5,
    } as any);

    expect(paymentMethods.previewOnchain).toHaveBeenCalledWith(store.btcpayStoreId, 'BTC', expect.any(Object), {
      store,
    });
    const [, , request] = (paymentMethods.previewOnchain as jest.Mock).mock.calls[0];
    expect(request).toEqual({
      amount: 5,
      config: {
        derivationScheme: 'zpubExample',
      },
    });
    expect(result.currency).toBe('BTC');
    expect(result.paymentMethodId).toBe('BTC-CHAIN');
    expect(result.addresses).toHaveLength(5);
    expect(result.addresses[0]?.address).toBe('bcrt1qpreview0');
    expect(result.addresses[4]?.index).toBe(4);
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
        derivationScheme: 'xpubExample',
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
        derivationScheme: 'xpubExample',
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
        derivationScheme: 'xpubExample',
        accountKeyPath: "m/84'/0'/0'",
        rootFingerprint: 'abcdef12'
      } as any
    );

    expect(paymentMethods.updateOnchainPaymentMethod).toHaveBeenCalledWith(
      expect.objectContaining({ masterFingerprint: 'abcdef12' }),
      expect.any(Object)
    );
  });

  it('persists metadata during the wizard flow and exposes the aggregated status', async () => {
    (walletRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
    (keysService.withStoreSettingsWriteKey as jest.Mock).mockImplementation(
      async (_storeId: string, _email: string, handler: (apiKey: string) => Promise<unknown>) => {
        await handler('scoped-key');
      }
    );

    await service.update(
      { id: 'tenant-user', email: 'merchant@example.com' },
      store.btcpayStoreId,
      {
        derivationScheme: 'wpkh([abcd1234/84\'/0\'/0\']xpubExample/0/*)',
        accountKeyPath: "m/84'/0'/0'",
        masterFingerprint: 'abcd1234',
        label: 'Desk wallet'
      } as any
    );

    expect(walletRepository.save).toHaveBeenCalled();

    const localWallet: ManagedStoreWalletEntity = {
      id: 'wallet-local',
      storeId: store.id,
      store,
      paymentMethodId: 'BTC-CHAIN',
      derivationScheme: 'PRESENT',
      accountKeyPath: "m/84'/0'/0'",
      masterFingerprint: 'ABCD1234',
      label: 'Desk wallet',
      createdAt: new Date(),
      updatedAt: new Date()
    } as ManagedStoreWalletEntity;

    (walletRepository.findOne as jest.Mock).mockResolvedValueOnce(localWallet);
    (paymentMethods.getOnchainMethodStatus as jest.Mock).mockResolvedValueOnce({
      storeId: store.btcpayStoreId,
      paymentMethodId: 'BTC-OnChain',
      enabled: true
    });

    const result = await service.getConfig(
      { id: 'tenant-user', email: 'merchant@example.com' },
      store.btcpayStoreId
    );

    expect(paymentMethods.getOnchain).toHaveBeenCalledWith(store.btcpayStoreId, 'BTC', {
      store,
      includeConfig: true,
    });
    expect(paymentMethods.previewOnchain).toHaveBeenLastCalledWith(
      store.btcpayStoreId,
      'BTC',
      { amount: 10 },
      { store }
    );

    expect(result).toEqual({
      storeId: store.btcpayStoreId,
      currency: 'BTC',
      paymentMethodId: 'BTC-CHAIN',
      enabled: true,
      connected: true,
      missingLocalMeta: false,
      metadata: {
        accountKeyPath: "m/84'/0'/0'",
        label: 'Desk wallet',
        hasDerivationScheme: true,
        hasMasterFingerprint: true
      },
      addressPreview: previewResponse.addresses
    });
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
          derivationScheme: 'xpubExample',
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
          derivationScheme: 'xpubExample',
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
          derivationScheme: 'xpubExample',
          accountKeyPath: "m/84'/0'/0'"
        } as any
      )
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(paymentMethods.updateOnchainPaymentMethod).not.toHaveBeenCalled();
  });

  it('flags missing local metadata when BTCPay reports an enabled method without stored config', async () => {
    (walletRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
    (paymentMethods.getOnchainMethodStatus as jest.Mock).mockResolvedValueOnce({
      storeId: store.btcpayStoreId,
      paymentMethodId: 'BTC-OnChain',
      enabled: true
    });

    const result = await service.getConfig(
      { id: 'tenant-user', email: 'merchant@example.com' },
      store.btcpayStoreId
    );

    expect(paymentMethods.getOnchain).toHaveBeenCalledWith(store.btcpayStoreId, 'BTC', {
      store,
      includeConfig: true,
    });
    expect(paymentMethods.previewOnchain).toHaveBeenLastCalledWith(
      store.btcpayStoreId,
      'BTC',
      { amount: 10 },
      { store }
    );

    expect(result.enabled).toBe(true);
    expect(result.connected).toBe(true);
    expect(result.missingLocalMeta).toBe(true);
    expect(result.metadata).toEqual({
      accountKeyPath: "m/84'/0'/0'",
      label: 'Desk wallet',
      hasDerivationScheme: true,
      hasMasterFingerprint: true
    });
    expect(result.addressPreview).toEqual(previewResponse.addresses);
  });

  it('surfaces a limited-view response when BTCPay hides sensitive fields', async () => {
    const localWallet: ManagedStoreWalletEntity = {
      id: 'wallet-limited',
      storeId: store.id,
      store,
      paymentMethodId: 'BTC-CHAIN',
      derivationScheme: 'PRESENT',
      accountKeyPath: "m/84'/0'/0'",
      masterFingerprint: 'ABCD1234',
      label: 'Desk wallet',
      createdAt: new Date(),
      updatedAt: new Date()
    } as ManagedStoreWalletEntity;

    (walletRepository.findOne as jest.Mock).mockResolvedValueOnce(localWallet);
    (paymentMethods.getOnchain as jest.Mock).mockRejectedValueOnce(new ForbiddenException());

    let thrown: ForbiddenException | null = null;
    try {
      await service.getConfig({ id: 'tenant-user', email: 'merchant@example.com' }, store.btcpayStoreId);
    } catch (error) {
      thrown = error as ForbiddenException;
    }

    expect(paymentMethods.getOnchain).toHaveBeenCalledWith(store.btcpayStoreId, 'BTC', {
      store,
      includeConfig: true,
    });
    expect(thrown).toBeInstanceOf(ForbiddenException);
    const response = (thrown as ForbiddenException).getResponse() as OnchainWalletStatusReadModel;
    expect(response.paymentMethodId).toBe('BTC-CHAIN');
    expect(response.connected).toBe(true);
    expect(response.addressPreview).toEqual([]);
    expect(response.metadata).toEqual({
      accountKeyPath: "m/84'/0'/0'",
      label: 'Desk wallet',
      hasDerivationScheme: true,
      hasMasterFingerprint: true
    });
    expect(response.missingLocalMeta).toBe(false);
    expect(paymentMethods.previewOnchain).not.toHaveBeenCalled();
  });
});
