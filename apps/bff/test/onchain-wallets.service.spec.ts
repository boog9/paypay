import { BadGatewayException, UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { OnchainWalletsService } from '../src/wallets/onchain-wallets.service';
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

  const previewResponse: OnchainPreviewResponse = {
    storeId: store.btcpayStoreId,
    currency: 'BTC',
    paymentMethodId: 'BTC-CHAIN',
    addresses: Array.from({ length: 10 }, (_, index) => ({
      address: `bcrt1qpreview${index}`,
      keyPath: `0/${index}`,
      index,
    })),
  };

  const paymentMethods = {
    previewOnchain: jest.fn().mockResolvedValue(previewResponse),
    updateOnchainPaymentMethod: jest.fn()
  } as unknown as BtcpayPaymentMethodsService;

  const keysService = {
    withStoreSettingsWriteKey: jest.fn()
  } as unknown as BtcpayKeysService;

  const service = new OnchainWalletsService(repository, paymentMethods, keysService);

  beforeEach(() => {
    jest.clearAllMocks();
    (repository.findOne as jest.Mock).mockResolvedValue(store);
    (paymentMethods.previewOnchain as jest.Mock).mockResolvedValue(previewResponse);
    (keysService.withStoreSettingsWriteKey as jest.Mock).mockReset();
    (paymentMethods.updateOnchainPaymentMethod as jest.Mock).mockReset();
    (paymentMethods.updateOnchainPaymentMethod as jest.Mock).mockResolvedValue(undefined);
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
});
