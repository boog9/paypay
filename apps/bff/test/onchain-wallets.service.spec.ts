import { Repository } from 'typeorm';
import { OnchainWalletsService } from '../src/wallets/onchain-wallets.service';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';
import { BtcpayPaymentMethodsService, OnchainPreviewResponse } from '../src/btcpay/btcpay.payment-methods.service';

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
  } as unknown as BtcpayPaymentMethodsService;

  const service = new OnchainWalletsService(repository, paymentMethods);

  beforeEach(() => {
    jest.clearAllMocks();
    (repository.findOne as jest.Mock).mockResolvedValue(store);
    (paymentMethods.previewOnchain as jest.Mock).mockResolvedValue(previewResponse);
  });

  it('limits preview addresses to the requested amount', async () => {
    const result = await service.preview('tenant-user', store.btcpayStoreId, {
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
});
